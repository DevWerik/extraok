const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

const longDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  timeZone: 'America/Sao_Paulo',
})

const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  timeZone: 'UTC',
})

export function formatCurrency(cents: number): string {
  const safeCents = Number.isFinite(cents) ? Math.round(cents) : 0
  return currencyFormatter.format(safeCents / 100)
}

export function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? 'Data inválida' : dateFormatter.format(date)
}

export function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Data inválida'
    : dateTimeFormatter.format(date)
}

export function formatLongDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data inválida'
  const formatted = longDateFormatter.format(date)
  return formatted.charAt(0).toLocaleUpperCase('pt-BR') + formatted.slice(1)
}

export function formatPercentage(value: number): string {
  return `${Math.round(value)}%`
}

export function formatMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)

  if (!match) return month

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const label = monthFormatter.format(new Date(Date.UTC(year, monthIndex, 1)))

  return label.replace('.', '')
}
