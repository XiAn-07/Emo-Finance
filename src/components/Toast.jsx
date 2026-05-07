import { useEffect } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

export default function Toast({ open, type = 'success', message, onClose, durationMs = 2000 }) {
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => onClose?.(), durationMs)
    return () => clearTimeout(t)
  }, [open, durationMs, onClose])

  if (!open) return null

  const Icon = type === 'error' ? XCircle : CheckCircle2
  const tone =
    type === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : 'border-emerald-200 bg-emerald-50 text-emerald-900'

  return (
    <div className="fixed right-4 top-4 z-50">
      <div className={`flex items-start gap-2 rounded-2xl border px-4 py-3 shadow-soft ${tone}`}>
        <Icon className="mt-0.5" size={18} />
        <div className="text-sm leading-relaxed">{message}</div>
      </div>
    </div>
  )
}

