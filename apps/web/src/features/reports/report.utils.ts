export function reportMonthDates(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const year = parts.find((part) => part.type === 'year')!.value
  const month = parts.find((part) => part.type === 'month')!.value
  const day = parts.find((part) => part.type === 'day')!.value
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${day}` }
}

export function reportDateError(from: string, to: string): string | null {
  if (!from || !to) return 'Informe as duas datas.'
  if (from > to) return 'A data final deve ser igual ou posterior à inicial.'
  if (Date.parse(to) - Date.parse(from) >= 366 * 86_400_000) return 'Selecione até 366 dias por relatório.'
  return null
}
