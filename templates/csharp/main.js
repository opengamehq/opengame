import { dotnet } from './_framework/dotnet.js';

const status = document.querySelector('#status');
try {
  const { getAssemblyExports, getConfig, runMain } = await dotnet.create();
  const config = getConfig();
  const { Target } = await getAssemblyExports(config.mainAssemblyName);
  // Main waits for the native adapter's init result; JavaScript only renders
  // the game and forwards input, without claiming a second bridge handler.
  const exitCode = await runMain(config.mainAssemblyName, []);
  if (exitCode !== 0) throw new Error(`C# initialization exited with code ${exitCode}.`);
  const canvas = document.querySelector('canvas');
  const context = canvas.getContext('2d');
  function draw() {
    context.fillStyle = '#17191c';
    context.fillRect(0, 0, 640, 440);
    context.fillStyle = '#f0be55';
    context.fillRect(Target.X(), 180, 70, 70);
    document.querySelector('#score').textContent = String(Target.Points());
  }
  canvas.addEventListener('pointerdown', event => {
    const bounds = canvas.getBoundingClientRect();
    Target.Tap((event.clientX - bounds.left) * 640 / bounds.width, (event.clientY - bounds.top) * 440 / bounds.height);
    draw();
  });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) Target.Shutdown();
  });
  status.textContent = 'Select the square to score.';
  requestAnimationFrame(() => {
    draw();
    requestAnimationFrame(() => Target.FrameRendered());
  });
} catch (error) {
  status.textContent = 'The game could not connect to OpenGame. Open it with opengame dev or on an OpenGame host.';
  console.error('C# game startup failed.', error);
}
