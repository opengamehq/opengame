const std = @import("std");
const og = @import("opengame-sdk/src/root.zig");
var score: i32 = 0;
var paused = false;
fn message(value: og.Message) void {
    if (!value.is_result and std.mem.eql(u8, value.name, "pause")) {
        const parsed = std.json.parseFromSlice(bool, std.heap.wasm_allocator, value.json, .{ .ignore_unknown_fields = true }) catch return;
        defer parsed.deinit();
        paused = parsed.value;
    }
    if (value.is_result and std.mem.eql(u8, value.name, "init")) {
        const parsed = std.json.parseFromSlice(struct { ok: bool }, std.heap.wasm_allocator, value.json, .{ .ignore_unknown_fields = true }) catch return;
        defer parsed.deinit();
        if (parsed.value.ok) og.ready() catch {};
    }
}
export fn start() void { og.attach(message) catch return; _ = og.request("init", "{}") catch return; }
export fn stop() void { og.detach(); }
export fn points() i32 { return score; }
export fn target_x() i32 { return 40 + @mod(score * 97, 520); }
export fn tap(x: f64, y: f64) void {
    const target: f64 = @floatFromInt(target_x());
    if (!paused and x >= target and x <= target + 70 and y >= 180 and y <= 250) score += 1;
}
