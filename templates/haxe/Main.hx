import opengame.Bridge;

class Main {
  static function main() {
    var canvas:js.html.CanvasElement = cast js.Browser.document.createElement("canvas");
    canvas.width = 640; canvas.height = 440; js.Browser.document.body.appendChild(canvas);
    var ctx = canvas.getContext2d(); var score = 0; var x = 40; var paused = false;
    var client:Bridge = null;
    function draw() {
      ctx.fillStyle = "#17191c"; ctx.fillRect(0, 0, 640, 440);
      ctx.fillStyle = "#f0be55"; ctx.fillRect(x, 180, 70, 70);
      ctx.fillStyle = "white"; ctx.fillText("Points: " + score, 20, 20);
    }
    client = new Bridge(function(message) {
      if (message.kind == "event" && message.name == "pause") paused = haxe.Json.parse(message.json);
      if (message.kind == "result" && message.name == "init" && haxe.Json.parse(message.json).ok) client.ready();
    });
    canvas.onclick = function(event) {
      var r = canvas.getBoundingClientRect(); var px = (event.clientX-r.left)*640/r.width; var py = (event.clientY-r.top)*440/r.height;
      if (!paused && px >= x && px <= x+70 && py >= 180 && py <= 250) { score++; x = 40+(score*97)%520; draw(); }
    };
    js.Browser.window.addEventListener("pagehide", function(_) client.close());
    draw(); client.request("init");
  }
}
