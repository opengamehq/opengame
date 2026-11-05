package main

import (
	"encoding/json"
	opengame "github.com/opengamehq/opengame-go"
	"syscall/js"
)

var handlers []js.Func

func main() {
	doc := js.Global().Get("document")
	canvas := doc.Call("querySelector", "canvas")
	ctx := canvas.Call("getContext", "2d")
	score, x, paused := 0, 40, false
	draw := func() {
		ctx.Set("fillStyle", "#17191c")
		ctx.Call("fillRect", 0, 0, 640, 440)
		ctx.Set("fillStyle", "#f0be55")
		ctx.Call("fillRect", x, 180, 70, 70)
		doc.Call("querySelector", "#score").Set("textContent", score)
	}
	client, err := opengame.New()
	if err != nil {
		panic(err)
	}
	go func() {
		for message := range client.Messages() {
			if message.Kind == "event" && message.Name == "pause" {
				var value bool
				if json.Unmarshal([]byte(message.JSON), &value) == nil {
					paused = value
				}
			}
			if message.Kind == "result" && message.Name == "init" {
				var result struct {
					OK bool `json:"ok"`
				}
				if json.Unmarshal([]byte(message.JSON), &result) == nil && result.OK {
					_ = client.Ready()
				}
			}
		}
	}()
	click := js.FuncOf(func(this js.Value, args []js.Value) any {
		event := args[0]
		rect := canvas.Call("getBoundingClientRect")
		px := (event.Get("clientX").Float() - rect.Get("left").Float()) * 640 / rect.Get("width").Float()
		py := (event.Get("clientY").Float() - rect.Get("top").Float()) * 440 / rect.Get("height").Float()
		if !paused && px >= float64(x) && px <= float64(x+70) && py >= 180 && py <= 250 {
			score++
			x = 40 + (score*97)%520
			draw()
		}
		return nil
	})
	stop := js.FuncOf(func(this js.Value, args []js.Value) any { client.Close(); return nil })
	handlers = append(handlers, click, stop)
	canvas.Call("addEventListener", "pointerdown", click)
	js.Global().Call("addEventListener", "pagehide", stop)
	draw()
	if _, err = client.Request("init", "{}"); err != nil {
		panic(err)
	}
	select {}
}
