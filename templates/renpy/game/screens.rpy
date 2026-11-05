screen main_menu():
    tag menu
    on "show" action Function(opengame_session.start)
    add Solid("#101521")
    vbox:
        align (0.5, 0.5)
        spacing 24
        text "Ren'Py target" size 44 color "#ffffff" xalign 0.5
        textbutton "Start" action Start() sensitive (not opengame_session.paused) xalign 0.5
    use opengame_status

screen say(who, what):
    window:
        xfill True
        yalign 1.0
        ysize 220
        background Solid("#1b2436")
        padding (40, 32)
        text what id "what" color "#ffffff" size 28

screen choice(items):
    vbox:
        align (0.5, 0.4)
        spacing 24
        for item in items:
            textbutton item.caption action item.action sensitive (not opengame_session.paused)

screen opengame_status():
    zorder 100
    modal opengame_session.paused
    timer 0.05 repeat True action Function(opengame_session.tick)
    vbox:
        xpos 24
        ypos 20
        spacing 8
        text "Score: [opengame_session.score]" color "#ffffff" size 28
        text opengame_session.status color "#a8bbdc" size 18
    if opengame_session.paused:
        add Solid("#101521ee")
        text "Paused by OpenGame" align (0.5, 0.5) color "#ffffff" size 36
        key "dismiss" action NullAction()
        key "game_menu" action NullAction()
        key "skip" action NullAction()
        key "toggle_skip" action NullAction()
        key "fast_skip" action NullAction()
        key "rollback" action NullAction()
