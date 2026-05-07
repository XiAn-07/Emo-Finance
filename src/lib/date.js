export function isSameMonth(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth()
}

export function formatDateTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function formatDateShort(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })
}

export function isWithinDays(iso, days) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  const now = Date.now()
  return now - t <= days * 24 * 60 * 60 * 1000
}

