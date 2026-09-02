import styled from "styled-components"

interface ApprovalProgressProps {
  label: string
  value: number
}

const ProgressTrack = styled.div<{ $value: number }>`
  position: relative;
  height: 0.5rem;
  width: 100%;
  overflow: hidden;
  border-radius: 9999px;
  background: var(--muted, #e5e7eb);

  &::after {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    width: ${({ $value }) => `${Math.min(100, Math.max(0, $value))}%`};
    border-radius: inherit;
    background: var(--success, #059669);
    content: "";
    transition: width 450ms ease;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      transition: none;
    }
  }
`

export function ApprovalProgress({ label, value }: ApprovalProgressProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{value}%</span>
      </div>
      <ProgressTrack
        $value={value}
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={value}
        role="progressbar"
      />
    </div>
  )
}
