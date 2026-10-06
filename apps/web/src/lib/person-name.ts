export function normalizeFullName(value: string) {
  return value.trim().replace(/\s+/gu, ' ')
}

export function isFullName(value: string) {
  const name = normalizeFullName(value)
  return name.length <= 100 && /^[\p{L}\p{M}][\p{L}\p{M}'’.-]*(?: [\p{L}\p{M}][\p{L}\p{M}'’.-]*)+$/u.test(name)
}
