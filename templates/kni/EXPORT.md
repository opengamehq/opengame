# Build prerequisite

Create a KNI Blazor WebAssembly project in this folder from the installed KNI templates, so there is one `.csproj` beside `opengame.json`. `opengame.json` already runs `dotnet publish -c Release -o publish -p:CompressionEnabled=false` and reads `publish/wwwroot`, which is what `opengame init` writes for such a project. The flag stops publish writing `.br` and `.gz` copies, which `opengame check` reports as nested archives; the game loads the plain files anyway. Publish leaves files already in `publish/`, so delete it once if an earlier publish ran without the flag. KNI 4.3's content builder needs the .NET 10 runtime beside the .NET 8 SDK. Use a relative base href, and retain content plus _framework. Do not use a server or desktop output as wwwroot.

Record the tool versions and export settings with the resulting fixture. Run the actual engine in a browser before counting this recipe as implemented.
