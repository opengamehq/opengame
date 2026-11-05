init -10 python:
    # Runtime handles must not enter rollback/save state. Create this session
    # client on demand, rather than serializing it with story variables.
    import opengame as opengame_sdk

    def opengame_connect():
        return opengame_sdk.Bridge() if opengame_sdk.available() else None
