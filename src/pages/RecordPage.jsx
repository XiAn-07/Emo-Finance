import { useEffect, useMemo, useRef, useState } from 'react'
import { addRecord } from '../lib/storage'
import Stars from '../components/Stars'
import Toast from '../components/Toast'

const categories = [
  '餐饮',
  '购物',
  '娱乐',
  '交通',
  '居住',
  '学习',
  '工资',
  '兼职',
  '投资',
  '其他',
]

function pad2(n) {
  return String(n).padStart(2, '0')
}

function todayDateInputValue() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function dateInputFromMonthKey(monthKey) {
  const mk = String(monthKey || '').trim()
  if (!/^\d{4}-\d{2}$/.test(mk)) return todayDateInputValue()
  const now = new Date()
  const cur = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  if (mk === cur) return todayDateInputValue()
  return `${mk}-01`
}

function currentTimeHHmm() {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export default function RecordPage({ monthKey, onSaved }) {
  const [type, setType] = useState('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('餐饮')
  const [note, setNote] = useState('')
  const lastAutoDateRef = useRef('')
  const [date, setDate] = useState(() => {
    const v = dateInputFromMonthKey(monthKey)
    lastAutoDateRef.current = v
    return v
  })
  const [emotionScore, setEmotionScore] = useState(3)
  const [toast, setToast] = useState({ open: false, type: 'success', message: '' })

  useEffect(() => {
    const nextAuto = dateInputFromMonthKey(monthKey)
    if (!date || date === lastAutoDateRef.current) {
      setDate(nextAuto)
    }
    lastAutoDateRef.current = nextAuto
  }, [monthKey])

  const title = useMemo(() => {
    return type === 'income' ? '这笔钱赚得累吗？' : '这笔消费冲动吗？'
  }, [type])

  function showToast(next) {
    setToast({ open: true, ...next })
  }

  function closeToast() {
    setToast((t) => ({ ...t, open: false }))
  }

  function onSubmit(e) {
    e.preventDefault()
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) {
      showToast({ type: 'error', message: '请输入正确的金额（> 0）' })
      return
    }
    addRecord({
      type,
      amount: n,
      category,
      note,
      emotionScore,
      date: `${date || todayDateInputValue()}T${currentTimeHHmm()}`,
    })
    setAmount('')
    setNote('')
    setEmotionScore(3)
    showToast({ type: 'success', message: '保存成功，已写入本地。' })
    onSaved?.()
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="app-card rounded-3xl border p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">记账录入</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">记录资金，也记录情绪。</div>
          </div>
          <div className="flex items-center gap-1 rounded-2xl bg-slate-50 p-1 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setType('income')}
              className={
                type === 'income'
                  ? 'rounded-xl accent-bg px-3 py-2 text-sm font-medium text-white shadow-sm'
                  : 'rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white/60 dark:text-slate-200 dark:hover:bg-white/10'
              }
            >
              记一笔收入
            </button>
            <button
              type="button"
              onClick={() => setType('expense')}
              className={
                type === 'expense'
                  ? 'rounded-xl accent-bg px-3 py-2 text-sm font-medium text-white shadow-sm'
                  : 'rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white/60 dark:text-slate-200 dark:hover:bg-white/10'
              }
            >
              记一笔支出
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-6 grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">金额</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="例如：39.9"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none ring-0 transition focus:border-slate-300 focus:shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">分类</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-300 focus:shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">备注</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              type="text"
              placeholder="可选：写点情绪/原因"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-300 focus:shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">日期</label>
            <input
              value={date}
              onChange={(e) => setDate(e.target.value)}
              type="date"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-300 focus:shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/20 dark:bg-white/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">1-5 星，越高越强烈。</div>
              </div>
              <Stars value={emotionScore} onChange={setEmotionScore} />
            </div>
            <div className="mt-3">
              <input
                value={emotionScore}
                onChange={(e) => setEmotionScore(Number(e.target.value))}
                type="range"
                min="1"
                max="5"
                step="1"
                className="emo-range"
              />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end">
            <button
              type="submit"
              className="rounded-2xl accent-bg px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-95 active:scale-[0.99]"
            >
              保存
            </button>
          </div>
        </form>
      </div>

      <Toast open={toast.open} type={toast.type} message={toast.message} onClose={closeToast} />
    </div>
  )
}
