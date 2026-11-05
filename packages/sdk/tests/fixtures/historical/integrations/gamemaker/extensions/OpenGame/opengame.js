/* The page owns the SDK. This file only copies arguments and queued results
 * across GameMaker's string/number extension interface. */
var OGGM_State = {
    bridge: null,
    queue: [],
    head: 0,
    rooms: new Set(),
    openedRooms: new Set(),
    pendingOpens: new Set(),
    earlyClosed: new Set(),
    error: ""
};

function OGGM_Fail(code, reason) {
    OGGM_State.error = JSON.stringify({ ok: false, error: code, reason: reason });
    return OGGM_State.error;
}

function OGGM_Unavailable() {
    return OGGM_Fail("unavailable", "Connect the GameMaker extension to the injected OpenGame.bridge first.");
}

function OGGM_Connect() {
    if (OGGM_State.bridge) {
        OGGM_Fail("adapter_already_connected", "One persistent controller must own this extension.");
        return 0;
    }
    var root = typeof globalThis !== "undefined" ? globalThis : window;
    var bridge = root.OpenGame && root.OpenGame.bridge;
    if (!bridge || typeof bridge.setHandler !== "function" ||
        typeof bridge.request !== "function" || typeof bridge.env !== "function" ||
        typeof bridge.player !== "function" || typeof bridge.ready !== "function" ||
        typeof bridge.send !== "function" || typeof bridge.sendTo !== "function" ||
        typeof bridge.disconnectPeer !== "function" ||
        !Number.isSafeInteger(bridge.maxPacketBytes) || bridge.maxPacketBytes < 0) {
        OGGM_Unavailable();
        return 0;
    }
    OGGM_State.queue = [];
    OGGM_State.head = 0;
    OGGM_State.rooms.clear();
    OGGM_State.openedRooms.clear();
    OGGM_State.pendingOpens.clear();
    OGGM_State.earlyClosed.clear();
    OGGM_State.error = "";
    OGGM_State.bridge = bridge;
    try {
        // This is the only handler registration. Room opens use this same owner.
        bridge.setHandler(function (kind, id, name, json, bytes) {
            if (OGGM_State.bridge !== bridge) return;
            var value = JSON.parse(json);
            if (kind === "event" && id > 0) {
                if (name === "room.close") {
                    OGGM_State.rooms.delete(id);
                    if (!OGGM_State.openedRooms.delete(id) && OGGM_State.pendingOpens.size) {
                        OGGM_State.earlyClosed.add(id);
                    }
                } else if (!OGGM_State.earlyClosed.has(id)) {
                    OGGM_State.rooms.add(id);
                }
            }
            if (kind === "result" &&
                (name === "room.host" || name === "room.join" || name === "room.joinInvite")) {
                if (value.ok && value.value && typeof value.value.room === "number") {
                    var room = value.value.room;
                    if (OGGM_State.earlyClosed.delete(room)) {
                        value.value.closed = true;
                    } else {
                        OGGM_State.rooms.add(room);
                        OGGM_State.openedRooms.add(room);
                    }
                }
                OGGM_State.pendingOpens.delete(id);
                if (!OGGM_State.pendingOpens.size) OGGM_State.earlyClosed.clear();
            }
            // SDK byte views expire at callback return. Copy before queuing;
            // an empty binary packet must stay distinct from a JSON packet.
            OGGM_State.queue.push({
                kind: kind, id: id, name: name, value: value,
                binary: bytes !== undefined,
                bytes: bytes === undefined ? [] : Array.from(bytes)
            });
        });
        return 1;
    } catch (_) {
        OGGM_State.bridge = null;
        OGGM_State.queue = [];
        OGGM_Fail("adapter_error", "The injected bridge could not attach the GameMaker extension.");
        return 0;
    }
}

function OGGM_Disconnect() {
    var bridge = OGGM_State.bridge;
    if (!bridge) return 1;
    // room.close executes on the request stack. Close before detaching, since
    // setHandler(null) alone only cancels pending opens, not established rooms.
    OGGM_State.rooms.forEach(function (room) {
        bridge.request("room.close", JSON.stringify({ room: room }));
    });
    bridge.setHandler(null);
    OGGM_State.bridge = null;
    OGGM_State.rooms.clear();
    OGGM_State.openedRooms.clear();
    OGGM_State.pendingOpens.clear();
    OGGM_State.earlyClosed.clear();
    OGGM_State.queue = [];
    OGGM_State.head = 0;
    return 1;
}

function OGGM_Connected() { return OGGM_State.bridge ? 1 : 0; }
function OGGM_LastError() { return OGGM_State.error; }

function OGGM_Poll() {
    if (OGGM_State.head >= OGGM_State.queue.length) return "";
    var event = OGGM_State.queue[OGGM_State.head];
    OGGM_State.queue[OGGM_State.head++] = null;
    if (OGGM_State.head === OGGM_State.queue.length) {
        OGGM_State.queue = [];
        OGGM_State.head = 0;
    } else if (OGGM_State.head * 2 >= OGGM_State.queue.length) {
        OGGM_State.queue = OGGM_State.queue.slice(OGGM_State.head);
        OGGM_State.head = 0;
    }
    return JSON.stringify(event);
}

function OGGM_Request(operation, args) {
    if (!OGGM_State.bridge) { OGGM_Unavailable(); return -1; }
    var id = OGGM_State.bridge.request(operation, args);
    if (operation === "room.host" || operation === "room.join" || operation === "room.joinInvite") {
        OGGM_State.pendingOpens.add(id);
    }
    return id;
}

function OGGM_Env() {
    if (!OGGM_State.bridge) { OGGM_Unavailable(); return "null"; }
    return OGGM_State.bridge.env();
}

function OGGM_Player() {
    if (!OGGM_State.bridge) { OGGM_Unavailable(); return "null"; }
    return OGGM_State.bridge.player();
}

function OGGM_Ready() {
    if (!OGGM_State.bridge) { OGGM_Unavailable(); return 0; }
    OGGM_State.bridge.ready();
    return 1;
}

function OGGM_MaxPacketBytes() {
    if (!OGGM_State.bridge) { OGGM_Unavailable(); return 0; }
    return OGGM_State.bridge.maxPacketBytes;
}

function OGGM_Send(room, peer, data, binary, reliable, targeted) {
    var bridge = OGGM_State.bridge;
    if (!bridge) return OGGM_Unavailable();
    var payload = data;
    if (binary) {
        // GML reads the actual buffer via buffer_peek. Numeric JSON avoids
        // depending on undocumented HTML5 or GX.games runner heap symbols.
        try {
            var bytes = JSON.parse(data);
            if (!Array.isArray(bytes)) throw new Error();
            if (bytes.length > bridge.maxPacketBytes) {
                return OGGM_Fail("message_too_large", "The buffer exceeds the SDK binary payload limit.");
            }
            for (var i = 0; i < bytes.length; ++i) {
                if (!Number.isInteger(bytes[i]) || bytes[i] < 0 || bytes[i] > 255) throw new Error();
            }
            payload = new Uint8Array(bytes);
        } catch (_) {
            return OGGM_Fail("invalid_message", "Binary data must be an array of bytes from a GameMaker buffer.");
        }
    }
    return targeted ? bridge.sendTo(room, peer, payload, !!reliable)
        : bridge.send(room, payload, !!reliable);
}

function OGGM_DisconnectPeer(room, peer) {
    if (!OGGM_State.bridge) return OGGM_Unavailable();
    return OGGM_State.bridge.disconnectPeer(room, peer);
}
