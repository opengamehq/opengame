init python:
    import opengame_session
    config.quit_callbacks.append(opengame_session.close)
    config.overlay_screens.append("opengame_status")

define narrator = Character(None)

label before_main_menu:
    $ opengame_session.close()
    return

label after_load:
    # An old save cannot restore a live browser client or pending request.
    $ opengame_session.start()
    return

label start:
    $ opengame_session.ensure_started()
    scene black
    narrator "The target is in view. Choose when to take your shot."
    jump target

label target:
    menu:
        "Take the shot":
            $ opengame_session.hit()
            narrator "A hit. The next target is ready."
        "Wait":
            narrator "You wait for another chance."
        "Return to the menu":
            $ opengame_session.close()
            return
    jump target
