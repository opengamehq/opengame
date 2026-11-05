extends Node2D
var points := 0
var target := Rect2(80, 180, 70, 70)
var platform
var pause_callback
var paused_by_host := false
func _ready():
    if OS.has_feature("web"):
        platform = JavaScriptBridge.get_interface("OpenGame")
        if platform:
            platform.init()
            pause_callback = JavaScriptBridge.create_callback(_host_pause)
            platform.onPause(pause_callback)
    queue_redraw()
    await RenderingServer.frame_post_draw
    if platform:
        platform.ready()
func _host_pause(args):
    paused_by_host = args[0]
func _input(event):
    if event is InputEventMouseButton and event.pressed and not paused_by_host and target.has_point(event.position):
        points += 1
        target.position.x = 40 + (points * 97) % 520
        queue_redraw()
func _draw():
    draw_rect(target, Color.GOLD)
    draw_string(ThemeDB.fallback_font, Vector2(20, 35), "Points: %d" % points, HORIZONTAL_ALIGNMENT_LEFT, -1, 24)
