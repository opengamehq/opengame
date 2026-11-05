//go:build js && wasm

package opengame

import (
	"errors"
	"sync"
	"syscall/js"
)

var active bool

type Bridge struct {
	value     js.Value
	callback  js.Func
	mu        sync.Mutex
	queue     []Message
	wake      chan struct{}
	done      chan struct{}
	stopped   chan struct{}
	closeDone chan struct{}
	closed    bool
	messages  chan Message
}

func New() (*Bridge, error) {
	window := js.Global().Get("window")
	connect := js.Global().Get("OpenGameNativeConnect")
	if window.IsUndefined() || window.IsNull() || connect.Type() != js.TypeFunction {
		return nil, ErrUnavailable
	}
	game := js.Global().Get("OpenGame")
	if game.IsUndefined() || game.IsNull() {
		return nil, ErrUnavailable
	}
	value := game.Get("bridge")
	if value.IsUndefined() || value.IsNull() {
		return nil, ErrUnavailable
	}
	if active {
		return nil, errors.New("OpenGame already has a Go owner")
	}
	b := &Bridge{wake: make(chan struct{}, 1), done: make(chan struct{}), stopped: make(chan struct{}), closeDone: make(chan struct{}), messages: make(chan Message)}
	b.callback = js.FuncOf(func(this js.Value, args []js.Value) any {
		m := Message{Kind: args[0].String(), ID: args[1].Int(), Name: args[2].String(), JSON: args[3].String()}
		b.mu.Lock()
		if !b.closed {
			b.queue = append(b.queue, m)
		}
		b.mu.Unlock()
		select {
		case b.wake <- struct{}{}:
		default:
		}
		return nil
	})
	b.value = connect.Invoke(b.callback)
	active = true
	go b.deliver()
	return b, nil
}

// A JS callback must never wait for a game to read a channel: the game may itself
// be awaiting a JS call. This FIFO transfers ownership to the reader in order.
// Consume Messages continuously; Close discards unread messages.
func (b *Bridge) deliver() {
	defer close(b.stopped)
	defer func() {
		b.mu.Lock()
		b.queue = nil
		b.mu.Unlock()
		close(b.messages)
	}()
	for {
		b.mu.Lock()
		if b.closed {
			b.mu.Unlock()
			return
		}
		var next Message
		var out chan Message
		if len(b.queue) > 0 {
			next = b.queue[0]
			out = b.messages
		}
		b.mu.Unlock()
		select {
		case <-b.done:
			return
		case <-b.wake:
		case out <- next:
			b.mu.Lock()
			b.queue[0] = Message{}
			b.queue = b.queue[1:]
			b.mu.Unlock()
		}
	}
}
func (b *Bridge) Messages() <-chan Message { return b.messages }
func (b *Bridge) check() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return ErrClosed
	}
	return nil
}
func (b *Bridge) Request(op, argsJSON string) (int, error) {
	if err := b.check(); err != nil {
		return 0, err
	}
	return b.value.Call("request", op, argsJSON).Int(), nil
}
func (b *Bridge) EnvironmentJSON() (string, error) {
	if err := b.check(); err != nil {
		return "", err
	}
	return b.value.Call("env").String(), nil
}
func (b *Bridge) PlayerJSON() (string, error) {
	if err := b.check(); err != nil {
		return "", err
	}
	return b.value.Call("player").String(), nil
}
func (b *Bridge) Ready() error {
	if err := b.check(); err != nil {
		return err
	}
	b.value.Call("ready")
	return nil
}

// Close waits for the sender to exit. A select can choose a ready receiver even
// when done is closed; waiting is what guarantees no delivery after this returns.
func (b *Bridge) Close() {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		<-b.closeDone
		return
	}
	b.closed = true
	close(b.done)
	b.mu.Unlock()
	<-b.stopped
	// Releasing the handler only after the sender exits keeps a callback from
	// queueing into a loop that is gone. The JS callback never waits for it.
	b.value.Call("close")
	b.callback.Release()
	active = false
	close(b.closeDone)
}
