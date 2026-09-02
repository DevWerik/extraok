import styled from 'styled-components'
import { formatCurrency } from '@/lib/formatters'
import type { RevenuePoint } from '@/services/contracts'

const ChartGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(var(--column-count), minmax(2.5rem, 1fr));
  align-items: end;
  gap: clamp(0.5rem, 2vw, 1rem);
  min-height: 14rem;
  padding-top: 1rem;
`

const BarColumn = styled.div`
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 0.75rem;
  height: 13rem;
  min-width: 0;
`

const BarTrack = styled.div`
  position: relative;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
  border-radius: var(--radius-sm) var(--radius-sm) 0.35rem 0.35rem;
  background: var(--secondary);
`

const BarFill = styled.div<{ $ratio: number }>`
  width: 100%;
  height: ${({ $ratio }) => `${Math.max(8, Math.round($ratio * 100))}%`};
  min-height: 0.65rem;
  border-radius: inherit;
  background: var(--chart-1);
  transition: height 350ms ease, filter 180ms ease;

  &::before {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 45%;
    background: linear-gradient(to top, rgb(255 255 255 / 0.12), transparent);
    pointer-events: none;
  }

  &:hover {
    filter: brightness(0.94);
  }
`

interface RevenueChartProps {
  data: RevenuePoint[]
}

export function RevenueChart({ data }: RevenueChartProps) {
  const max = Math.max(...data.map((point) => point.amountCents), 1)

  return (
    <ChartGrid
      style={{ '--column-count': Math.max(data.length, 1) } as React.CSSProperties}
      aria-label="Evolução mensal da receita adicional"
    >
      {data.map((point) => (
        <BarColumn key={point.month}>
          <BarTrack
            role="img"
            aria-label={`${point.label}: ${formatCurrency(point.amountCents)}`}
            title={`${point.label}: ${formatCurrency(point.amountCents)}`}
          >
            <BarFill $ratio={point.amountCents / max} />
          </BarTrack>
          <span className="truncate text-center text-xs font-semibold capitalize text-muted-foreground">
            {point.label}
          </span>
        </BarColumn>
      ))}
    </ChartGrid>
  )
}
