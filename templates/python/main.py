from js import document
from pyodide.ffi import create_proxy
canvas = document.querySelector("canvas")
ctx = canvas.getContext("2d")
points, x = 0, 40

def draw():
    ctx.fillStyle = "#17191c"
    ctx.fillRect(0, 0, 640, 440)
    ctx.fillStyle = "#f0be55"
    ctx.fillRect(x, 180, 70, 70)
    document.querySelector("#score").textContent = str(points)

def click(event):
    global points, x
    r = canvas.getBoundingClientRect()
    px, py = (event.clientX-r.left)*640/r.width, (event.clientY-r.top)*440/r.height
    if x <= px <= x+70 and 180 <= py <= 250:
        points += 1
        x = 40 + (points*97) % 520
        draw()

click_proxy = create_proxy(click)
canvas.addEventListener("pointerdown", click_proxy)
draw()
