// Keep the code as text: leading zeroes are significant.
export function normalizePasswordResetCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8)
}

export function remainingSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1_000))
}

export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
