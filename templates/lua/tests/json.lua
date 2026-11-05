-- Run from this template: lua tests/json.lua (Lua 5.4, as used by wasmoon).
local json = dofile('json.lua')
local value, _, error = json.decode('{"ok":true,"bytes":[0,128,255],"paused":false,"none":null,"name":"a\\n\\uD83D\\uDE00"}')
assert(not error, error)
assert(value.ok and value.paused == false and value.none == json.null)
assert(value.bytes[3] == 255 and value.name == 'a\n' .. utf8.char(0x1f600))
local copy, _, encode_error = json.decode(json.encode(value))
assert(not encode_error, encode_error)
assert(copy.name == value.name and copy.paused == false)
for _, invalid in ipairs({'01', '1.', '1.e2', '1e+', '[1,]', '{"a":}', 'true false', '"\\uD800"'}) do
    local _, _, failure = json.decode(invalid)
    assert(failure, 'accepted invalid JSON: ' .. invalid)
end
local false_value, _, false_error = json.decode('false')
assert(false_value == false and not false_error)
