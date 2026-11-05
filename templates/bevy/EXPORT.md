# Build prerequisite

Create a Bevy project using the engine version you intend to ship, add the wasm target and select webgl2 or webgpu. Bevy APIs and asset layout must match that version. No Cargo project with a guessed engine version is supplied here. Use the raw Rust target as the compiler smoke test; it is not a Bevy fixture.

Record the tool versions and export settings with the resulting fixture. Run the actual engine in a browser before counting this recipe as implemented.
