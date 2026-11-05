package main

import (
 "image/color"
 "log"
 "syscall/js"
 "github.com/hajimehoshi/ebiten/v2"
 "github.com/hajimehoshi/ebiten/v2/ebitenutil"
 "github.com/hajimehoshi/ebiten/v2/inpututil"
 "github.com/hajimehoshi/ebiten/v2/vector"
 "fmt"
)
var paused bool
var pauseCallback js.Func

type Game struct { points int; x float32; first bool }
func (g *Game) Update() error {
 if paused { return nil }
 if inpututil.IsMouseButtonJustPressed(ebiten.MouseButtonLeft) {
  x,y:=ebiten.CursorPosition()
  if float32(x)>=g.x && float32(x)<=g.x+70 && y>=180 && y<=250 {g.points++;g.x=float32(40+(g.points*97)%520)}
 }
 return nil
}
func (g *Game) Draw(screen *ebiten.Image) {
 screen.Fill(color.RGBA{23,25,28,255})
 vector.DrawFilledRect(screen,g.x,180,70,70,color.RGBA{240,190,85,255},false)
 ebitenutil.DebugPrint(screen,fmt.Sprintf("Points: %d",g.points))
 if !g.first {g.first=true;og:=js.Global().Get("OpenGame");if !og.IsUndefined(){og.Call("ready")}}
}
func (g *Game) Layout(w,h int)(int,int){return 640,440}
func main(){
 og:=js.Global().Get("OpenGame")
 if !og.IsUndefined(){og.Call("init");pauseCallback=js.FuncOf(func(this js.Value,args []js.Value)any{paused=args[0].Bool();return nil});og.Call("onPause",pauseCallback)}
 ebiten.SetWindowSize(640,440)
 if err:=ebiten.RunGame(&Game{x:80});err!=nil{log.Fatal(err)}
}
