import { useEffect, type RefObject } from "react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

export function useLandingAnimations(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current

    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }

    gsap.registerPlugin(ScrollTrigger)

    const context = gsap.context(() => {
      gsap.from("[data-hero-item]", {
        duration: 0.72,
        ease: "power2.out",
        stagger: 0.09,
        y: 22,
        clearProps: "transform",
      })

      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
        gsap.from(element, {
          duration: 0.65,
          ease: "power2.out",
          scrollTrigger: {
            once: true,
            start: "top 88%",
            trigger: element,
          },
          y: 28,
          clearProps: "transform",
        })
      })
    }, root)

    return () => context.revert()
  }, [rootRef])
}
