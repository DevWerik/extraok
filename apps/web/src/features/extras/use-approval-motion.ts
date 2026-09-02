import gsap from 'gsap'
import { useLayoutEffect, type RefObject } from 'react'

export function useApprovalMotion(scope: RefObject<HTMLElement | null>, signal: number) {
  useLayoutEffect(() => {
    if (!scope.current || signal === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        '[data-success-feedback]',
        { autoAlpha: 0, scale: 0.92, y: 8 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(1.6)', clearProps: 'all' },
      )
    }, scope)

    return () => context.revert()
  }, [scope, signal])
}
