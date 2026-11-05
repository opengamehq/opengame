-- A local codec for the wasmoon example. Browser services still use the SDK;
-- this parser only moves JSON across the Lua boundary without a network fetch.
local M = { null = {} }
local escapes = { ['"']='"', ['\\']='\\', ['/']='/', b='\b', f='\f', n='\n', r='\r', t='\t' }
function M.decode(source)
    local at = 1
    local function whitespace() local _, last = source:find('^[ \n\r\t]*', at); at = (last or at - 1) + 1 end
    local function fail() error('Invalid JSON at byte ' .. at, 0) end
    local value
    local function string_value()
        at = at + 1
        local parts = {}
        while at <= #source do
            local char = source:sub(at, at); at = at + 1
            if char == '"' then return table.concat(parts) end
            if char == '\\' then
                local code = source:sub(at, at); at = at + 1
                if code == 'u' then
                    local hex = source:sub(at, at+3)
                    if not hex:match('^%x%x%x%x$') then fail() end
                    local number = tonumber(hex, 16); at = at+4
                    if number >= 0xd800 and number <= 0xdbff then
                        if source:sub(at, at+1) ~= '\\u' then fail() end
                        local tail = source:sub(at+2, at+5)
                        if not tail:match('^%x%x%x%x$') then fail() end
                        local low = tonumber(tail, 16)
                        if low < 0xdc00 or low > 0xdfff then fail() end
                        number = 0x10000+(number-0xd800)*0x400+low-0xdc00; at=at+6
                    elseif number >= 0xdc00 and number <= 0xdfff then fail() end
                    parts[#parts+1] = utf8.char(number)
                elseif escapes[code] then parts[#parts+1] = escapes[code]
                else fail() end
            else
                if char:byte() < 32 then fail() end
                parts[#parts+1] = char
            end
        end
        fail()
    end
    value = function()
        whitespace()
        local char = source:sub(at, at)
        if char == '"' then return string_value() end
        if char == '[' or char == '{' then
            local object = char == '{'; local close = object and '}' or ']'; local result = {}; at=at+1; whitespace()
            if source:sub(at, at) == close then at=at+1; return result end
            repeat
                local key = #result+1
                if object then
                    if source:sub(at, at) ~= '"' then fail() end
                    key = string_value(); whitespace()
                    if source:sub(at, at) ~= ':' then fail() end
                    at=at+1
                end
                result[key] = value(); whitespace()
                char = source:sub(at, at); at=at+1
                if char == close then return result end
                if char ~= ',' then fail() end
                whitespace()
            until false
        end
        for token, decoded in pairs({ ['true']=true, ['false']=false, ['null']=M.null }) do
            if source:sub(at, at+#token-1) == token then at=at+#token; return decoded end
        end
        local start = at
        local function digit() return source:sub(at, at):match('^%d$') ~= nil end
        if source:sub(at, at) == '-' then at=at+1 end
        if source:sub(at, at) == '0' then
            at=at+1; if digit() then fail() end
        else
            if not source:sub(at, at):match('^[1-9]$') then fail() end
            repeat at=at+1 until not digit()
        end
        if source:sub(at, at) == '.' then
            at=at+1; if not digit() then fail() end
            repeat at=at+1 until not digit()
        end
        local exponent = source:sub(at, at)
        if exponent == 'e' or exponent == 'E' then
            at=at+1
            local sign = source:sub(at, at)
            if sign == '+' or sign == '-' then at=at+1 end
            if not digit() then fail() end
            repeat at=at+1 until not digit()
        end
        local number = tonumber(source:sub(start, at-1))
        if not number or number == math.huge or number == -math.huge then fail() end
        return number
    end
    local ok, result = pcall(value)
    if not ok then return nil, at, result end
    whitespace()
    if at <= #source then return nil, at, 'Trailing JSON content' end
    return result, at
end
local function quote(value)
    return '"' .. value:gsub('[%z\1-\31\\"]', function(char)
        if char == '"' or char == '\\' then return '\\' .. char end
        return string.format('\\u%04x', char:byte())
    end) .. '"'
end
function M.encode(value)
    if value == M.null then return 'null' end
    local kind = type(value)
    if kind == 'string' then return quote(value) end
    if kind == 'boolean' then return tostring(value) end
    if kind == 'number' then
        assert(value == value and value ~= math.huge and value ~= -math.huge, 'Non-finite JSON number')
        return tostring(value)
    end
    assert(kind == 'table', 'Unsupported JSON value')
    local array, count, fields = true, 0, {}
    for key in pairs(value) do count=count+1; if type(key) ~= 'number' or key < 1 or key % 1 ~= 0 then array=false end end
    if array and count == #value then
        for i=1,#value do fields[i] = M.encode(value[i]) end
        return '[' .. table.concat(fields, ',') .. ']'
    end
    for key, item in pairs(value) do assert(type(key) == 'string', 'JSON object keys must be strings'); fields[#fields+1] = quote(key) .. ':' .. M.encode(item) end
    return '{' .. table.concat(fields, ',') .. '}'
end
return M
