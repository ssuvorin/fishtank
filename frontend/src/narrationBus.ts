/**
 * Shared, per-frame state between the voiced briefing (writer) and the 3D
 * scene (reader). A plain mutable object: the scene samples it inside its
 * render loop, so no React re-render happens per audio frame.
 */
export interface NarrationState {
  /** Smoothed loudness of the playing voice, 0..1. */
  level: number
  /** Rule currently being spoken about, if any — its pillar lights up. */
  activeRuleId: string | null
  playing: boolean
}

export const narrationBus: NarrationState = {
  level: 0,
  activeRuleId: null,
  playing: false,
}

export function resetNarrationBus(): void {
  narrationBus.level = 0
  narrationBus.activeRuleId = null
  narrationBus.playing = false
}
