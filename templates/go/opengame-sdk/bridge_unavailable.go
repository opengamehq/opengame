//go:build !js || !wasm

package opengame

type Bridge struct{}

func New() (*Bridge, error)                         { return nil, ErrUnavailable }
func (*Bridge) Messages() <-chan Message            { return nil }
func (*Bridge) Request(string, string) (int, error) { return 0, ErrUnavailable }
func (*Bridge) EnvironmentJSON() (string, error)    { return "", ErrUnavailable }
func (*Bridge) PlayerJSON() (string, error)         { return "", ErrUnavailable }
func (*Bridge) Ready() error                        { return ErrUnavailable }
func (*Bridge) Close()                              {}
