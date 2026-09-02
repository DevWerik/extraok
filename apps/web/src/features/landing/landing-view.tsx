import { useRef } from "react"

import { BenefitsSection } from "@/features/landing/components/benefits-section"
import { ExtraExampleSection } from "@/features/landing/components/extra-example-section"
import { FinalCtaSection } from "@/features/landing/components/final-cta-section"
import { HeroSection } from "@/features/landing/components/hero-section"
import { HowItWorksSection } from "@/features/landing/components/how-it-works-section"
import { LandingFooter } from "@/features/landing/components/landing-footer"
import { LandingHeader } from "@/features/landing/components/landing-header"
import { useLandingAnimations } from "@/features/landing/hooks/use-landing-animations"

export function LandingView() {
  const pageRef = useRef<HTMLDivElement>(null)

  useLandingAnimations(pageRef)

  return (
    <div className="min-h-svh bg-background text-foreground" ref={pageRef}>
      <LandingHeader />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <BenefitsSection />
        <ExtraExampleSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  )
}
