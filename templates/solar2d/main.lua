display.setDefault("background",0.09,0.1,0.11)
local points=0
local label=display.newText("Points: 0",160,40,native.systemFont,24)
local target=display.newRect(160,200,70,70)
target:setFillColor(1,0.75,0.3)
target:addEventListener("tap",function() points=points+1;label.text="Points: "..points;target.x=50+(points*97)%220;return true end)
