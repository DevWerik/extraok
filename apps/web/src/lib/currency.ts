export function reaisToCents(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null

  const cents = Math.round(value * 100)
  return Number.isSafeInteger(cents) ? cents : null
}

export function parseCurrencyInputToCents(value: string | number): number | null {
  if (typeof value === 'number') return reaisToCents(value)

  const sanitized = value
    .trim()
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '')

  if (!sanitized || sanitized.startsWith('-')) return null

  const lastComma = sanitized.lastIndexOf(',')
  const lastDot = sanitized.lastIndexOf('.')
  let normalized: string

  if (lastComma >= 0) {
    normalized = sanitized.replace(/\./g, '').replace(',', '.')
  } else if (lastDot >= 0) {
    const decimalDigits = sanitized.length - lastDot - 1
    normalized =
      decimalDigits === 2 ? sanitized : sanitized.replace(/\./g, '')
  } else {
    normalized = sanitized
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null

  return reaisToCents(Number(normalized))
}

export function centsToCurrencyInput(cents: number): string {
  const safeCents = Number.isSafeInteger(cents) && cents >= 0 ? cents : 0
  return (safeCents / 100).toFixed(2).replace('.', ',')
}
