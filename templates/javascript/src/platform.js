import { og } from '@opengamehq/sdk';

export const state = { paused: false, points: 0 };
await og.init();
og.onPause(value => { state.paused = value; });
const score = document.querySelector('#score');
const status = document.querySelector('#status');
const record = document.querySelector('#record');
og.player.onChange(player => { status.textContent = player.handle ?? 'Guest'; });
export function collect() {
  if (state.paused) return;
  state.points++;
  score.textContent = String(state.points);
}
record.addEventListener('click', async () => {
  const result = await og.leaderboard('points').submit(state.points);
  status.textContent = result.ok ? 'Score recorded' : `Score unavailable: ${result.error}`;
  og.track('round_end', { result: 'completed' });
});
export function ready() { requestAnimationFrame(() => og.ready()); }
