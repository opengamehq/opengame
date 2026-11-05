import { discard, readJson } from './response.js';

export type Achievement = { achievementId: string; title: string; description: string; unlocked: boolean; unlockedAt: string | null; source: 'game_reported' };
export type AchievementUnlock = { achievementId: string; unlocked: true; firstUnlock: boolean; unlockedAt: string; source: 'game_reported' };
export type AchievementResult<T> = { ok: true; value: T } | { ok: false; error: string };
type Session = { token: string | null; preview: boolean; disposed: boolean; generation: number };

/** Build-time constants, the same ones index.ts reads, so they fold into the
 * call sites rather than being carried as five fields on the one instance. */
declare const __SDK_CONFIG__: { eventsApiOrigin: string; eventTimeoutMs: number; achievementIdCharsMax: number; leaderboards: { responseBytesMax: number } };

/** The private callback supplies a live credential and a monotonic revision.
 * Comparing tokens alone would allow an old A reply after A -> B -> A. */
export class Achievements {
  constructor(private readonly session: () => Session) {}
  private validId(id: unknown): id is string {
    return typeof id === 'string' && id.length <= __SDK_CONFIG__.achievementIdCharsMax && /^[a-z0-9][a-z0-9_-]*$/.test(id);
  }
  private async request<T>(id?: string): Promise<AchievementResult<T>> {
    const session = this.session();
    if (session.disposed) return { ok: false, error: 'disposed' };
    if (session.preview) return { ok: false, error: 'unavailable_in_preview' };
    if (!session.token) return { ok: false, error: 'unavailable' };
    const stale = (): AchievementResult<T> | null => {
      const current = this.session();
      return current.disposed ? { ok: false, error: 'disposed' }
        : current.generation !== session.generation || current.token !== session.token
          ? { ok: false, error: 'session_changed' } : null;
    };
    try {
      const signal = AbortSignal.timeout(__SDK_CONFIG__.eventTimeoutMs);
      const response = await fetch(new URL('/v1/achievements', __SDK_CONFIG__.eventsApiOrigin), {
        method: id === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        signal, headers: { Authorization: `Bearer ${session.token}`, ...(id ? { 'Content-Type': 'application/json' } : {}) },
        ...(id ? { body: JSON.stringify({ achievement: id }) } : {}),
      });
      const changed = stale();
      if (changed || !response.ok || response.status === 202) {
        discard(response);
        return changed ?? { ok: false, error: response.status === 400 ? 'invalid_achievement' : 'achievement_unavailable' };
      }
      let value: unknown;
      try { value = await readJson(response, __SDK_CONFIG__.leaderboards.responseBytesMax, signal); }
      catch { return stale() ?? { ok: false, error: signal.aborted ? 'network' : 'invalid_response' }; }
      const row = value as Partial<AchievementUnlock> | null;
      const valid = id === undefined ? Array.isArray(value) && value.every(row => row && typeof row === 'object' &&
        this.validId(row.achievementId) && typeof row.title === 'string' && typeof row.description === 'string' &&
        typeof row.unlocked === 'boolean' && (row.unlocked ? typeof row.unlockedAt === 'string' : row.unlockedAt === null) && row.source === 'game_reported')
        : row && typeof row === 'object' && row.achievementId === id && row.unlocked === true &&
          typeof row.firstUnlock === 'boolean' && typeof row.unlockedAt === 'string' && row.source === 'game_reported';
      return stale() ?? (valid ? { ok: true, value: value as T } : { ok: false, error: 'invalid_response' });
    } catch { return stale() ?? { ok: false, error: 'network' }; }
  }
  /** Unlock a declared, active achievement for the current player. Repeating an
   * unlock preserves its original time and returns firstUnlock: false. Requires
   * a published game session; previews return unavailable_in_preview. */
  unlock(id: string): Promise<AchievementResult<AchievementUnlock>> {
    if (!this.validId(id)) return Promise.resolve({ ok: false, error: 'invalid_achievement' });
    return this.request<AchievementUnlock>(id);
  }
  /** Read active achievements and this player's unlock state. Requires a published
   * game session; previews return unavailable_in_preview. */
  list(): Promise<AchievementResult<Achievement[]>> { return this.request<Achievement[]>(); }
}
