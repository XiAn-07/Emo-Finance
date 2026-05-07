import { Star } from 'lucide-react'

export default function Stars({ value, onChange, size = 18 }) {
  const v = Math.min(5, Math.max(1, Number(value || 1)))
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const n = i + 1
        const active = n <= v
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange?.(n)}
            className="rounded-md p-1 transition hover:bg-white/60 active:scale-[0.98] dark:hover:bg-white/10"
            aria-label={`评分 ${n} 星`}
          >
            <Star
              size={size}
              className={`transition-colors duration-200 ${
                active ? 'fill-[var(--accent)] text-[var(--accent)]' : 'text-slate-300 dark:text-slate-600'
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}
