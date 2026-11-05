local points, x = 0, 80
function love.draw()
 love.graphics.clear(0.09,0.1,0.11)
 love.graphics.setColor(1,0.75,0.3)
 love.graphics.rectangle("fill",x,180,70,70)
 love.graphics.setColor(1,1,1)
 love.graphics.print("Points: " .. points,20,20)
end
function love.mousepressed(mx,my,button)
 if button==1 and mx>=x and mx<=x+70 and my>=180 and my<=250 then points=points+1;x=40+(points*97)%520 end
end
