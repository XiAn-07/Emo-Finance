import { BarChart3, Brain, Moon, PawPrint, PlusCircle, Settings2, Sun } from 'lucide-react'

const items = [
  { key: 'record', label: '记账', Icon: PlusCircle },
  { key: 'dashboard', label: '看板', Icon: BarChart3 },
  { key: 'pet', label: '宠物', Icon: PawPrint },
  { key: 'ai', label: 'AI 诊疗室', Icon: Brain },
  { key: 'settings', label: '设置', Icon: Settings2 },
]

export default function TopNav({ page, onChange, monthKey, months, onMonthChange, theme, onThemeChange }) {
  return (
    <div className="sticky top-0 z-40 border-b border-[#5C4033]/70 bg-[#FDF6E3]/80 text-slate-900 backdrop-blur-md dark:border-[#A855F7] dark:bg-[#1e1b4b]/80 dark:text-slate-100">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="leading-tight">
          <div className="font-pixel text-sm text-[#5C4033] dark:text-[#E9D5FF]">Emo-Finance</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-[#5C4033]/40 bg-white px-3 py-2 shadow-sm dark:border-[#A855F7] dark:bg-[#0F172A] dark:shadow-[0_0_15px_rgba(168,85,247,0.45)]">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-200">月份</div>
            <select
              value={monthKey}
              onChange={(e) => onMonthChange?.(e.target.value)}
              className="max-w-[96px] rounded-xl bg-white text-sm font-semibold text-slate-900 outline-none sm:max-w-none dark:bg-[#0F172A] dark:text-slate-100"
            >
              {(months || []).map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => onThemeChange?.((t) => (t === 'dark' ? 'light' : 'dark'))}
            className="flex items-center gap-2 rounded-2xl border border-[#5C4033]/40 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-[#A855F7] dark:bg-[#0F172A] dark:text-slate-100 dark:shadow-[0_0_15px_rgba(168,85,247,0.45)] dark:hover:bg-slate-900"
            aria-label="切换昼夜模式"
            title="切换昼夜模式"
          >
            {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
            <span className="hidden sm:inline">{theme === 'dark' ? '夜间' : '日间'}</span>
          </button>

          <div className="flex items-center gap-2 rounded-2xl border border-[#5C4033]/40 bg-white p-1 shadow-sm dark:border-[#A855F7] dark:bg-[#0F172A] dark:shadow-[0_0_15px_rgba(168,85,247,0.45)]">
            {items.map(({ key, label, Icon }) => {
              const active = page === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChange?.(key)}
                  className={
                    active
                      ? 'flex items-center gap-2 rounded-xl accent-bg px-3 py-2 text-sm font-medium text-white'
                      : 'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900'
                  }
                >
                  <Icon size={16} />
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
