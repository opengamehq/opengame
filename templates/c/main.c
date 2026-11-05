#include <emscripten.h>
static double target_x = 80;
static int points = 0;
EM_JS(void, setup, (), {
  const c = Module.canvas; c.width = 640; c.height = 440;
  c.addEventListener('pointerdown', e => {
    const r = c.getBoundingClientRect();
    _tap((e.clientX-r.left)*c.width/r.width, (e.clientY-r.top)*c.height/r.height);
  });
  if (window.OpenGame) window.OpenGame.init();
});
EM_JS(int, paused, (), { return window.__ogPaused ? 1 : 0; });
EM_JS(void, draw, (double x, int score), {
  const c = Module.canvas, ctx = c.getContext('2d');
  ctx.fillStyle='#17191c'; ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#f0be55'; ctx.fillRect(x,180,70,70);
  ctx.fillStyle='white'; ctx.font='20px system-ui'; ctx.fillText('Points: '+score,20,35);
  if (!Module.ogReady && window.OpenGame) { Module.ogReady=true; window.OpenGame.ready(); }
});
EMSCRIPTEN_KEEPALIVE void tap(double x, double y) {
  if (!paused() && x>=target_x && x<=target_x+70 && y>=180 && y<=250) { points++; target_x=40+(points*97)%520; }
}
void frame(void) { draw(target_x, points); }
int main(void) {
 setup();
 EM_ASM({ if (window.OpenGame) window.OpenGame.onPause(p => { window.__ogPaused=p; }); });
 emscripten_set_main_loop(frame, 0, 1);
 return 0;
}
