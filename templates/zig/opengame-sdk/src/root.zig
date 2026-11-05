const std = @import("std");
const builtin = @import("builtin");
const web = builtin.cpu.arch == .wasm32 and builtin.os.tag == .freestanding;

extern "opengame" fn og_available() u32;
extern "opengame" fn og_attach() void;
extern "opengame" fn og_detach() void;
extern "opengame" fn og_request(op: [*]const u8, op_len: usize, json: [*]const u8, json_len: usize) u32;
extern "opengame" fn og_read(which: u32, out: [*]u8, capacity: usize) usize;
extern "opengame" fn og_ready() void;

pub const Error = error{ Unavailable, AlreadyAttached, Closed };
pub const Message = struct {
    is_result: bool,
    id: u32,
    name: []const u8,
    // Borrowed only for the callback.
    json: []const u8,

    pub fn clone(self: Message, allocator: std.mem.Allocator) !OwnedMessage {
        const name = try allocator.dupe(u8, self.name);
        errdefer allocator.free(name);
        const json = try allocator.dupe(u8, self.json);
        return .{ .value = .{ .is_result = self.is_result, .id = self.id, .name = name, .json = json }, .allocator = allocator };
    }
};
pub const OwnedMessage = struct {
    value: Message,
    allocator: std.mem.Allocator,
    pub fn deinit(self: OwnedMessage) void {
        self.allocator.free(self.value.name);
        self.allocator.free(self.value.json);
    }
};

var handler: ?*const fn (Message) void = null;
pub fn available() bool { return if (web) og_available() != 0 else false; }
pub fn attach(callback: *const fn (Message) void) Error!void {
    if (!available()) return Error.Unavailable;
    if (handler != null) return Error.AlreadyAttached;
    handler = callback;
    if (web) og_attach();
}
pub fn detach() void { if (web and handler != null) og_detach(); handler = null; }
fn check() Error!void { if (!available()) return Error.Unavailable; if (handler == null) return Error.Closed; }
pub fn request(op: []const u8, args_json: []const u8) Error!u32 {
    try check();
    return if (web) og_request(op.ptr, op.len, args_json.ptr, args_json.len) else Error.Unavailable;
}
pub fn ready() Error!void { try check(); if (web) og_ready(); }
fn read(allocator: std.mem.Allocator, which: u32) ![]u8 {
    try check();
    if (!web) return Error.Unavailable;
    var empty: [0]u8 = .{};
    const length = og_read(which, &empty, 0);
    const result = try allocator.alloc(u8, length);
    _ = og_read(which, result.ptr, result.len);
    return result;
}
pub fn environmentJson(allocator: std.mem.Allocator) ![]u8 { return read(allocator, 0); }
pub fn playerJson(allocator: std.mem.Allocator) ![]u8 { return read(allocator, 1); }

// The JS host owns these temporary allocations and frees them in its finally
// block after dispatch, including if a game callback traps or has detached.
export fn og_alloc(length: usize) usize {
    if (!web or length == 0) return 0;
    const memory = std.heap.wasm_allocator.alloc(u8, length) catch return 0;
    return @intFromPtr(memory.ptr);
}
export fn og_free(pointer: usize, length: usize) void {
    if (web and length != 0) std.heap.wasm_allocator.free(@as([*]u8, @ptrFromInt(pointer))[0..length]);
}
fn slice(pointer: usize, length: usize) []const u8 {
    return if (length == 0) &.{} else @as([*]const u8, @ptrFromInt(pointer))[0..length];
}
export fn og_dispatch(kind: u32, id: u32, np: usize, nl: usize, jp: usize, jl: usize) void {
    if (handler) |callback| callback(.{
        .is_result = kind != 0, .id = id, .name = slice(np, nl), .json = slice(jp, jl),
    });
}
