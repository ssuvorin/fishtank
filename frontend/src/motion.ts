import { useLayoutEffect } from 'react'
import type { DependencyList, RefObject } from 'react'
import { animate, stagger, utils } from 'animejs'

export const prefersReducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Staggered rise-in of `selector` children inside `ref`, replayed whenever
 * `deps` change. Initial state is set before paint (layout effect) so there is
 * no flash of the final state; reverted on cleanup so StrictMode's double
 * mount and re-renders start clean.
 */
export function useStaggerIn(
  ref: RefObject<HTMLElement>,
  selector: string,
  deps: DependencyList,
  { step = 50, start = 0, distance = 8 }: { step?: number; start?: number; distance?: number } = {},
): void {
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || prefersReducedMotion()) return
    const targets = root.querySelectorAll<HTMLElement>(selector)
    if (targets.length === 0) return
    // From-values are rendered on creation, so delayed items start hidden.
    const anim = animate(targets, {
      opacity: [0, 1],
      translateY: [distance, 0],
      duration: 600,
      delay: stagger(step, { start }),
      ease: 'outExpo',
      // Drop inline transform/opacity once settled so CSS :hover transforms work.
      onComplete: (a) => utils.cleanInlineStyles(a),
    })
    return () => {
      anim.revert()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
