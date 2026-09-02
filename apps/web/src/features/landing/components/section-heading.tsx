interface SectionHeadingProps {
  align?: "left" | "center"
  description: string
  eyebrow: string
  title: string
}

export function SectionHeading({
  align = "left",
  description,
  eyebrow,
  title,
}: SectionHeadingProps) {
  const alignment = align === "center" ? "mx-auto text-center" : ""

  return (
    <div className={`max-w-2xl ${alignment}`}>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
        {description}
      </p>
    </div>
  )
}
