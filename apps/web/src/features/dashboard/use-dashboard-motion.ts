import gsap from 'gsap'
import { useLayoutEffect, type RefObject } from 'react'

export function useDashboardMotion(scope: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (!scope.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const context = gsap.context(() => {
      gsap.from('[data-metric-card]', {
        autoAlpha: 0,
        y: 18,
        duration: 0.55,
        stagger: 0.08,
        ease: 'power2.out',
        clearProps: 'all',
      })
    }, scope)

    return () => context.revert()
  }, [scope])
}
