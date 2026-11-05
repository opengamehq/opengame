local M = {}
function M.available()
    return type(rawget(_G, "__og_wasmoon_available")) == "function" and __og_wasmoon_available()
end
for _, name in ipairs({"request", "env", "player", "ready", "poll", "close"}) do
    local operation = name
    M[operation] = function(...)
        assert(M.available(), "OpenGame wasmoon host unavailable")
        return _G["__og_wasmoon_" .. operation](...)
    end
end
return M
