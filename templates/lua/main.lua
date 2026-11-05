local json = require('json')
local client = assert(require('opengame').connect(require('opengame.hosts.wasmoon'), json))
local points, paused, ready = 0, false, false
client.set_handler(function(message)
    if message.kind == 'event' and message.name == 'pause' then
        local value, _, error = json.decode(message.json); assert(not error, error); paused = value
    end
    if message.kind == 'result' and message.name == 'init' then
        local result, _, error = json.decode(message.json)
        assert(not error, error)
        assert(result.ok, 'OpenGame init failed')
        ready = true; client.ready()
    end
end)
client.request('init', '{}')
function poll() client.poll() end
function collect()
    if ready and not paused then points = points+1 end
    return points
end
function close() client.close() end
