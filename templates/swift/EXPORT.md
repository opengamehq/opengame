# Rebuilding the Swift browser fixture

Run from `templates/swift/`, or the root of a copied starter. These commands
are for the validating parent/creator; they were not run in this source task.

```bash
# Record the actual toolchain before building.
swift --version
swift sdk list
swift package --swift-sdk wasm32-unknown-wasip1 js --help

# Compile the SwiftTarget product and package its genuine web output.
npm install
SWIFT_WASM_SDK=wasm32-unknown-wasip1 npm run build

# The same packaging step against an already-produced genuine export:
npm run package:web -- "$PWD/.build/opengame-web"

# Check the final tree, then open it locally.
opengame check . --json
opengame dev .
```

The two packaging commands above are alternatives; running both is harmless.
The wrapper asks the installed PackageToJS plugin which flags it supports.
For a plugin without `--output`, set `PACKAGE_TO_JS_OUTPUT` to its documented
output folder before running `npm run build`. It will fail rather than invent
a runtime when that folder or plugin is unavailable. Preserve `Package.resolved`
and record the plugin/toolchain versions with the real fixture.

Source fixture: `Package.swift`, `Sources/SwiftTarget/main.swift`,
`Web/game-host.js`, and the complete `opengame-sdk/` folder. Real generated
fixture: `dist/index.html`, the original PackageToJS JavaScript/runtime/wasm,
`dist/game-host.js`, `dist/opengame-global.js` with its notice, and
`dist/opengame-sdk/{lifecycle.js,LICENSE}`. The index
must load `opengame-global.js` and lifecycle before any generated runtime script.
No generated wasm or replacement loader is supplied in source control.

In the parent-owned runtime pass, verify movement, pointer hit testing, Space,
one ready signal after initialization and a painted frame, pause/resume without
a position jump, muted/unmuted sound, and the board result after five points.
Navigate away while a request is pending and confirm shutdown releases the
native callback. Reopening must create a fresh working owner. Review failed
initialization/submission messages as well as success. Local success does not
replace the real CLI upload, scan, review, preview and public-path gates.
