import { useLayoutEffect, useRef } from 'react'
import { animate, stagger, utils } from 'animejs'
import { prefersReducedMotion } from '../motion'

/**
 * Ambient backdrop: slow-breathing gold contour lines plus drifting dust
 * motes. Pure SVG driven by anime.js; anime pauses its engine while the tab is
 * hidden, and reduced-motion users get the static frame.
 */
const LINES = [
  { a: 'M-50 420 C 220 330, 460 520, 720 400 S 1180 300, 1500 420', b: 'M-50 400 C 240 480, 480 330, 740 430 S 1200 520, 1500 380' },
  { a: 'M-50 520 C 260 450, 520 600, 780 500 S 1220 420, 1500 540', b: 'M-50 540 C 200 600, 500 450, 760 540 S 1160 620, 1500 500' },
  { a: 'M-50 300 C 300 240, 560 380, 820 290 S 1240 220, 1500 310', b: 'M-50 320 C 280 360, 540 230, 800 320 S 1260 360, 1500 280' },
]
const MOTES = 22

export default function AmbientBackground() {
  const ref = useRef<SVGSVGElement>(null)

  useLayoutEffect(() => {
    const svg = ref.current
    if (!svg || prefersReducedMotion()) return
    const lines = Array.from(svg.querySelectorAll<SVGPathElement>('.ambient__line'))
    const motes = svg.querySelectorAll<SVGCircleElement>('.ambient__mote')
    const anims = [
      ...lines.map((el, i) =>
        animate(el, {
          d: [LINES[i].a, LINES[i].b],
          duration: 9000 + i * 2400,
          ease: 'inOutSine',
          loop: true,
          alternate: true,
        }),
      ),
      animate(lines, {
        strokeDashoffset: [0, -1200],
        duration: 60000,
        ease: 'linear',
        loop: true,
      }),
      animate(motes, {
        translateX: () => utils.random(-60, 60),
        translateY: () => utils.random(-90, -20),
        opacity: [{ to: () => utils.random(0.25, 0.7, 2) }, { to: 0.05 }],
        duration: () => utils.random(7000, 13000),
        delay: stagger(260),
        ease: 'inOutSine',
        loop: true,
        alternate: true,
      }),
    ]
    return () => anims.forEach((a) => a.revert())
  }, [])

  return (
    <svg
      ref={ref}
      className="ambient"
      viewBox="0 0 1440 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="ambient-g" x1="0" x2="1">
          <stop offset="0" stopColor="#f5b544" stopOpacity="0" />
          <stop offset="0.5" stopColor="#f5b544" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f08a24" stopOpacity="0" />
        </linearGradient>
      </defs>
      {LINES.map((l, i) => (
        <path key={i} className="ambient__line" d={l.a} strokeDasharray="2 10" />
      ))}
      {Array.from({ length: MOTES }, (_, i) => (
        <circle
          key={i}
          className="ambient__mote"
          cx={((i * 977) % 1440) + 0.5}
          cy={180 + ((i * 523) % 560)}
          r={i % 5 === 0 ? 1.8 : 1.1}
        />
      ))}
    </svg>
  )
}
