#include "raylib.h"
#include <emscripten.h>
static Rectangle target={80,180,70,70}; static int points;
static void frame(void) {
 if (IsMouseButtonPressed(MOUSE_BUTTON_LEFT) && CheckCollisionPointRec(GetMousePosition(),target)) { points++; target.x=40+(points*97)%520; }
 BeginDrawing(); ClearBackground((Color){23,25,28,255}); DrawRectangleRec(target,GOLD); DrawText(TextFormat("Points: %i",points),20,20,24,RAYWHITE); EndDrawing();
 EM_ASM({ if (!Module.ogReady && window.OpenGame) { Module.ogReady=true; window.OpenGame.init(); window.OpenGame.ready(); } });
}
int main(void) { InitWindow(640,440,"Target practice"); emscripten_set_main_loop(frame,0,1); return 0; }
