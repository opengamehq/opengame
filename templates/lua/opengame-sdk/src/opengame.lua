local M = {}

-- A host is explicit: neither stock Lua nor desktop LÖVE has browser interop.
function M.connect(host, json)
    if not host or not host.available() then
        return nil, "unavailable"
    end
    json = json or require("dkjson")
    local closed = false
    local handler = nil
    local client = {}
    local function check()
        assert(not closed, "OpenGame bridge is closed")
    end
    function client.set_handler(callback)
        check()
        handler = callback
    end
    function client.request(operation, args_json)
        check()
        return host.request(operation, args_json or "{}")
    end
    function client.env() check(); return host.env() end
    function client.player() check(); return host.player() end
    function client.ready() check(); host.ready() end
    function client.poll()
        check()
        local messages, _, err = json.decode(host.poll())
        assert(not err, err)
        local delivered = {}
        for _, message in ipairs(messages) do
            if handler then handler(message) end
            -- A handler that closed the client has taken its last message.
            if closed then break end
            delivered[#delivered + 1] = message
        end
        return delivered
    end
    function client.close()
        if closed then return end
        host.close()
        closed = true
        handler = nil
    end
    return client
end
return M
