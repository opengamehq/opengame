package opengame

import "errors"

var ErrUnavailable = errors.New("OpenGame unavailable: requires js/wasm and OpenGame.bridge")
var ErrClosed = errors.New("OpenGame bridge is closed")

// JSON preserves the bridge's result or event JSON verbatim.
type Message struct {
	Kind string
	ID   int
	Name string
	JSON string
}
