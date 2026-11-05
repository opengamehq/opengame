package opengame;

typedef Message = {
  var kind:String;
  var id:Int;
  var name:String;
  var json:String;
}

#if js
private extern class NativeBridge {
  function close():Void;
  function request(op:String, json:String):Int;
  function env():String;
  function player():String;
  function ready():Void;
}
#end

class Bridge {
  static var attached = false;
  var closed = false;
  #if js
  var native:NativeBridge;
  #end

  public function new(handler:Message->Void) {
    #if js
    if (!js.Syntax.code("!!globalThis.OpenGame?.bridge && typeof globalThis.OpenGameNativeConnect === \"function\"")) throw "OpenGame unavailable: load opengame-global.js and web/lifecycle.js first.";
    if (attached) throw "OpenGame already has a Haxe owner.";
    var callback = function(kind:String, id:Int, name:String, json:String) {
      handler({kind: kind, id: id, name: name, json: json});
    };
    native = js.Syntax.code("globalThis.OpenGameNativeConnect({0})", callback);
    attached = true;
    #else
    throw "OpenGame is unavailable outside the Haxe JavaScript target.";
    #end
  }
  function check():Void { if (closed) throw "OpenGame bridge is closed."; }
  public function request(operation:String, argsJson:String = "{}"):Int {
    check();
    #if js return native.request(operation, argsJson); #else throw "OpenGame unavailable"; #end
  }
  public function environmentJson():String {
    check(); #if js return native.env(); #else throw "OpenGame unavailable"; #end
  }
  public function playerJson():String {
    check(); #if js return native.player(); #else throw "OpenGame unavailable"; #end
  }
  public function ready():Void {
    check(); #if js native.ready(); #else throw "OpenGame unavailable"; #end
  }
  public function close():Void {
    if (closed) return;
    #if js native.close(); #end
    closed = true;
    attached = false;
  }
}
