import { useEffect, useRef, useState } from 'react'
import { requestNarration, voiceEnabled } from '../api'
import type { AuditResponse, NarrationResponse } from '../api'
import { narrationBus, resetNarrationBus } from '../narrationBus'

type State =
  | { kind: 'checking' }
  | { kind: 'off' }
  | { kind: 'ready' }
  | { kind: 'loading' }
  | { kind: 'playing' | 'paused' | 'ended'; n: NarrationResponse }
  | { kind: 'error'; message: string }

function b64ToBlobUrl(b64: string, mime: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * Voiced executive briefing (ElevenLabs via the backend). Plays the script
 * with word-level karaoke captions; loudness and the rule being spoken are
 * published on `narrationBus` for the 3D scene. Hidden when the server has
 * no ElevenLabs key configured.
 */
export default function BriefingVoice({ result }: { result: AuditResponse }) {
  const [state, setState] = useState<State>({ kind: 'checking' })
  const [wordIdx, setWordIdx] = useState(-1)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    let alive = true
    voiceEnabled().then((on) => alive && setState({ kind: on ? 'ready' : 'off' }))
    return () => {
      alive = false
    }
  }, [])

  // new audit → drop the old take
  useEffect(() => teardown, [result])

  function teardown() {
    cancelAnimationFrame(rafRef.current)
    audioRef.current?.pause()
    audioRef.current = null
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    ctxRef.current?.close().catch(() => undefined)
    ctxRef.current = null
    resetNarrationBus()
  }

  function loop(n: NarrationResponse, analyser: AnalyserNode) {
    const buf = new Uint8Array(analyser.fftSize)
    let lastWord = -1
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)
      const a = audioRef.current
      if (!a) return
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      narrationBus.level = Math.min(1, Math.sqrt(sum / buf.length) * 4)
      const t = a.currentTime
      let cue: string | null = null
      for (const c of n.cues) if (c.start <= t) cue = c.rule_id
      narrationBus.activeRuleId = cue
      let w = lastWord
      while (w + 1 < n.words.length && n.words[w + 1].start <= t) w++
      if (w !== lastWord) {
        lastWord = w
        setWordIdx(w)
      }
      setProgress(a.duration ? t / a.duration : 0)
    }
    tick()
  }

  async function play() {
    if ((state.kind === 'paused' || state.kind === 'ended') && audioRef.current) {
      if (state.kind === 'ended') audioRef.current.currentTime = 0
      await ctxRef.current?.resume()
      await audioRef.current.play()
      narrationBus.playing = true
      setState({ kind: 'playing', n: state.n })
      return
    }
    setState({ kind: 'loading' })
    try {
      const n = await requestNarration(result)
      teardown()
      const url = b64ToBlobUrl(n.audio_base64, n.mime)
      urlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio
      const ctx = new AudioContext()
      ctxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaElementSource(audio).connect(analyser)
      analyser.connect(ctx.destination)
      audio.addEventListener('ended', () => {
        narrationBus.playing = false
        narrationBus.level = 0
        narrationBus.activeRuleId = null
        setState({ kind: 'ended', n })
      })
      await audio.play()
      narrationBus.playing = true
      setWordIdx(-1)
      setState({ kind: 'playing', n })
      loop(n, analyser)
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Voice briefing failed.' })
    }
  }

  function pause() {
    if (state.kind !== 'playing') return
    audioRef.current?.pause()
    narrationBus.playing = false
    narrationBus.level = 0
    setState({ kind: 'paused', n: state.n })
  }

  if (state.kind === 'checking' || state.kind === 'off') return null

  const n = 'n' in state ? state.n : null
  const playing = state.kind === 'playing'
  const duration = audioRef.current?.duration || 0

  return (
    <div className={`voice${playing ? ' voice--playing' : ''}`}>
      <button
        type="button"
        className="voice__btn"
        onClick={playing ? pause : play}
        disabled={state.kind === 'loading'}
        aria-label={playing ? 'Pause voice briefing' : 'Play voice briefing'}
      >
        {state.kind === 'loading' ? (
          <span className="spinner" aria-hidden />
        ) : playing ? (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <rect x="3" y="2.5" width="3.4" height="11" rx="1" fill="currentColor" />
            <rect x="9.6" y="2.5" width="3.4" height="11" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M4 2.6v10.8a.6.6 0 00.9.5l8.6-5.4a.6.6 0 000-1L4.9 2.1a.6.6 0 00-.9.5z" fill="currentColor" />
          </svg>
        )}
      </button>

      <div className="voice__body">
        <div className="voice__top">
          <span className="voice__title">
            {state.kind === 'loading'
              ? 'Synthesizing the board briefing…'
              : state.kind === 'error'
                ? 'Voice briefing unavailable'
                : n
                  ? 'Board briefing · voiced'
                  : 'Listen to the board briefing'}
          </span>
          <span className="voice__credit mono">Voice · ElevenLabs</span>
        </div>

        {state.kind === 'error' && <p className="voice__error">{state.message}</p>}

        {n ? (
          <>
            <p className="voice__captions" aria-live="off">
              {n.words.map((w, i) => (
                <span
                  key={i}
                  className={i < wordIdx ? 'is-said' : i === wordIdx ? 'is-now' : undefined}
                >
                  {w.text}{' '}
                </span>
              ))}
            </p>
            <div className="voice__bar" aria-hidden>
              <span style={{ width: `${Math.round(progress * 1000) / 10}%` }} />
            </div>
            <span className="voice__time mono">
              {fmtTime(progress * duration)} / {fmtTime(duration)}
            </span>
          </>
        ) : (
          state.kind !== 'error' && (
            <p className="voice__lede">
              A 30-second spoken summary of the exposure and the top three drivers — the
              bars light up as each one is read.
            </p>
          )
        )}
      </div>
    </div>
  )
}
