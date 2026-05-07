import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, Bot, Coffee, Leaf, PiggyBank, RefreshCw, ShieldCheck, Sparkles, Trash2, Trophy } from 'lucide-react'
import Stars from '../components/Stars'
import { formatDateShort, formatDateTime, isSameMonth } from '../lib/date'
import {
  deleteRecord,
  getAiSettings,
  getAiMonthlyReviews,
  getBudgetSettingsForMonth,
  getMonthlySummary,
  getRecords,
  setBudgetSettings,
  subscribeBudget,
  subscribeRecords,
} from '../lib/storage'

function formatCurrency(n) {
  const v = Number(n || 0)
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n))
}

function clamp100(n) {
  return Math.min(100, Math.max(0, n))
}

function safeDiv(a, b) {
  const x = Number(a)
  const y = Number(b)
  if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return 0
  return x / y
}

function monthStartFromKey(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map((x) => Number(x))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return new Date()
  return new Date(y, m - 1, 1)
}

function daysInMonth(d) {
  const dt = new Date(d)
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
}

function monthKeyFromDate(d) {
  const dt = new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function monthKeyPrev(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map((x) => Number(x))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKeyFromDate(new Date())
  const d = new Date(y, m - 2, 1)
  return monthKeyFromDate(d)
}

function formatMonthLabel(monthKey) {
  const [y, m] = String(monthKey || '').split('-')
  if (!y || !m) return String(monthKey || '')
  return `${y}年${m}月`
}

function isSameDay(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

function resolveChatCompletionsUrl(input) {
  const raw = String(input || '').trim().replace(/。+$/g, '')
  if (!raw) return ''
  if (!/^https?:\/\//i.test(raw)) return ''
  const noTrail = raw.replace(/\/+$/g, '')
  if (/\/v1\/chat\/completions$/i.test(noTrail)) return noTrail
  if (/\/v1$/i.test(noTrail)) return `${noTrail}/chat/completions`
  return `${noTrail}/v1/chat/completions`
}

const ESSENTIAL_KEYWORDS = [
  '餐饮',
  '交通',
  '住房',
  '水电',
  '午饭',
  '晚饭',
  '超市',
  '生活',
  'Food',
  'Transport',
]

function includesAnyKeyword(text, keywords) {
  const t = String(text || '')
  if (!t) return false
  return keywords.some((k) => t.includes(k))
}

function scoreCloserToTargetRatio(ratio, target = 0.6) {
  const r = Number(ratio)
  if (!Number.isFinite(r)) return 0
  const d = Math.abs(r - target)
  return clamp100((1 - d / 0.6) * 100)
}

function includesNegativeEmotion(note) {
  const t = String(note || '').toLowerCase()
  if (!t) return false
  return /后悔|难过|委屈|焦虑|崩溃|郁闷|不值|冲动|emo|低落|烦|糟|亏|罪恶感/i.test(t)
}

function isHighRegretExpense(r) {
  return r.type === 'expense' && r.emotionScore >= 4 && (includesNegativeEmotion(r.note) || r.emotionScore === 5)
}

export default function DashboardPage({ monthKey, theme }) {
  const [records, setRecords] = useState(() => getRecords())
  const [onlyRegret, setOnlyRegret] = useState(false)
  const [monthlyBudget, setMonthlyBudget] = useState(() => getBudgetSettingsForMonth(monthKey).monthlyBudget)
  const [aiTip, setAiTip] = useState('')
  const [aiTipLoading, setAiTipLoading] = useState(false)
  const [aiTipError, setAiTipError] = useState('')
  const [aiTipNonce, setAiTipNonce] = useState(0)
  const [historyOpen, setHistoryOpen] = useState('')

  useEffect(() => {
    setRecords(getRecords())
    return subscribeRecords(() => setRecords(getRecords()))
  }, [])

  useEffect(() => {
    setMonthlyBudget(getBudgetSettingsForMonth(monthKey).monthlyBudget)
    return subscribeBudget(() => setMonthlyBudget(getBudgetSettingsForMonth(monthKey).monthlyBudget))
  }, [monthKey])

  const monthStats = useMemo(() => {
    const now = monthStartFromKey(monthKey)
    let income = 0
    let expense = 0
    for (const r of records) {
      if (!isSameMonth(r.date, now)) continue
      if (r.type === 'income') income += r.amount
      else expense += r.amount
    }
    return { income, expense, balance: income - expense }
  }, [records, monthKey])

  const monthlySummary = useMemo(() => getMonthlySummary(records), [records])
  const totalNetWorth = monthlySummary?.totalNetWorth || 0

  const lastMonthCarry = useMemo(() => {
    const lastKey = monthKeyPrev(monthKey)
    const hit = monthlySummary.months.find((m) => m.month === lastKey)
    const balance = Number(hit?.balance || 0)
    return balance > 0 ? { month: lastKey, balance } : null
  }, [monthKey, monthlySummary.months])

  const radarData = useMemo(() => {
    const now = monthStartFromKey(monthKey)
    const month = records.filter((r) => isSameMonth(r.date, now))

    const expenses = month.filter((r) => r.type === 'expense' && r.amount > 0)
    const incomes = month.filter((r) => r.type === 'income' && r.amount > 0)

    const expenseAmount = expenses.reduce((s, r) => s + r.amount, 0)
    const incomeAmount = incomes.reduce((s, r) => s + r.amount, 0)

    // 维度 1：消费理性 = (5 - 平均冲动指数) / 5 * 100
    const avgImpulse = expenses.length ? expenses.reduce((s, r) => s + r.emotionScore, 0) / expenses.length : null
    const consumptionRational = avgImpulse == null ? 10 : clamp100(((5 - avgImpulse) / 5) * 100)

    // 维度 2：情绪回报 = 平均治愈指数 / 5 * 100
    // 这里的“治愈指数”用 (6 - 冲动指数) 近似：冲动越高，治愈越低
    const avgHealing = expenses.length ? expenses.reduce((s, r) => s + (6 - r.emotionScore), 0) / expenses.length : null
    const emotionReturn = avgHealing == null ? 10 : clamp100((avgHealing / 5) * 100)

    // 维度 3：储蓄意志 = (1 - 总支出/总收入) * 100
    // 无收入时无法计算结余率，给 10 分底分
    const savingsWill = incomeAmount > 0 ? clamp100((1 - expenseAmount / incomeAmount) * 100) : 10

    // 维度 4：搞钱动力 = 收入金额与劳累度的平衡得分
    // 收入规模越大得分越高；劳累度越接近 3（不过度透支也不躺平）越高
    const avgFatigue = incomes.length ? incomes.reduce((s, r) => s + r.emotionScore, 0) / incomes.length : null
    const incomeNorm = clamp01(incomeAmount / 8000)
    const fatigueBalance = avgFatigue == null ? 0 : clamp01(1 - Math.abs(avgFatigue - 3) / 2)
    const grindMotivation =
      incomeAmount > 0 ? clamp100(incomeNorm * 40 + fatigueBalance * 60) : 10

    // 维度 5：生存刚需
    // 规则：本月支出中，若分类或备注包含刚需关键词，则计入“刚需支出”
    // 打分：刚需支出占比越接近 60% 分数越高；>90% 或 <20% 会显著变低
    const essentialsAmount = expenses
      .filter((r) => includesAnyKeyword(r.category, ESSENTIAL_KEYWORDS) || includesAnyKeyword(r.note, ESSENTIAL_KEYWORDS))
      .reduce((s, r) => s + r.amount, 0)
    const essentialsRatio = expenseAmount > 0 ? essentialsAmount / expenseAmount : null
    const essentialsScore = essentialsRatio == null ? 10 : scoreCloserToTargetRatio(essentialsRatio, 0.6)

    // 维度 6：财务续航
    // 规则：财务续航天数 = 余额 / 日均支出；再映射到 0-100 分（以 30 天为满分）
    const today = new Date()
    const daysElapsed = isSameMonth(today, now) ? Math.max(1, today.getDate()) : 30
    const dailyExpense = expenseAmount / daysElapsed
    const balance = incomeAmount - expenseAmount
    const enduranceDays = dailyExpense > 0 ? balance / dailyExpense : null
    const financialEndurance = enduranceDays == null ? 10 : clamp100(clamp01(enduranceDays / 30) * 100)

    return [
      { metric: '消费理性', value: Math.max(10, consumptionRational) },
      { metric: '情绪回报', value: Math.max(10, emotionReturn) },
      { metric: '储蓄意志', value: Math.max(10, Number.isFinite(savingsWill) ? savingsWill : 10) },
      { metric: '搞钱动力', value: Math.max(10, grindMotivation) },
      { metric: '生存刚需', value: Math.max(10, essentialsScore) },
      { metric: '财务续航', value: Math.max(10, financialEndurance) },
    ]
  }, [records, monthKey])

  const personaBadge = useMemo(() => {
    const map = Object.fromEntries(radarData.map((x) => [x.metric, x.value]))
    const rational = Number(map['消费理性'] || 10)
    const emotion = Number(map['情绪回报'] || 10)
    const savings = Number(map['储蓄意志'] || 10)
    const grind = Number(map['搞钱动力'] || 10)
    const essentials = Number(map['生存刚需'] || 10)
    const endurance = Number(map['财务续航'] || 10)

    if (savings >= 70 && rational >= 65) {
      return { title: '理性守财匠', desc: '你把钱花在刀刃上，也把安全感留给未来。', Icon: PiggyBank }
    }
    if (savings < 25 && rational < 35) {
      return { title: '多巴胺月光族', desc: '你很会犒赏自己。试试把快乐“预算化”，会更稳。', Icon: Sparkles }
    }
    if (emotion >= 70 && rational >= 45) {
      return { title: '治愈投资家', desc: '你愿意为情绪价值买单，但整体仍保持清醒。', Icon: Leaf }
    }
    if (endurance >= 65 && essentials >= 55) {
      return { title: '稳稳续航派', desc: '生活开销和现金流很稳，抗波动能力不错。', Icon: ShieldCheck }
    }
    if (grind >= 70 && savings >= 40) {
      return { title: '稳健进阶者', desc: '搞钱动力在线，也懂得把成果沉淀下来。', Icon: Trophy }
    }
    return { title: '平衡探索者', desc: '你在“快乐”和“规划”之间寻找自己的最优解。', Icon: Leaf }
  }, [radarData])

  const impulsiveSpend = useMemo(() => {
    const now = monthStartFromKey(monthKey)
    return records
      .filter((r) => isSameMonth(r.date, now) && r.type === 'expense' && r.amount > 0 && r.emotionScore >= 4)
      .reduce((s, r) => s + r.amount, 0)
  }, [records, monthKey])

  const PersonaIcon = personaBadge.Icon

  const chartData = useMemo(() => {
    const now = monthStartFromKey(monthKey)
    const month = records.filter((r) => isSameMonth(r.date, now))
    const items = month.slice(0, 14).reverse()
    return items.map((r) => ({
      name: formatDateShort(r.date),
      amount: r.type === 'income' ? r.amount : -r.amount,
      emotionScore: r.emotionScore,
    }))
  }, [records, monthKey])

  const chartGrid = theme === 'dark' ? 'rgba(255,255,255,0.12)' : '#e2e8f0'
  const chartAxis = theme === 'dark' ? 'rgba(255,255,255,0.45)' : '#94a3b8'
  const chartText = theme === 'dark' ? 'rgba(255,255,255,0.75)' : '#64748b'

  const recent = useMemo(() => {
    const now = monthStartFromKey(monthKey)
    const month = records.filter((r) => isSameMonth(r.date, now))
    const list = onlyRegret ? month.filter(isHighRegretExpense) : month
    return list.slice(0, 10)
  }, [records, onlyRegret, monthKey])

  const budgetRate = useMemo(() => {
    if (!monthlyBudget) return 0
    return (monthStats.expense / monthlyBudget) * 100
  }, [monthStats.expense, monthlyBudget])

  const forecast = useMemo(() => {
    const monthStart = monthStartFromKey(monthKey)
    const totalDays = daysInMonth(monthStart)
    const today = new Date()
    const elapsedDays = isSameMonth(today, monthStart) ? Math.max(1, today.getDate()) : totalDays
    const dailyExpense = monthStats.expense / elapsedDays
    const predictedExpense = dailyExpense * totalDays
    return { elapsedDays, totalDays, dailyExpense, predictedExpense }
  }, [monthKey, monthStats.expense])

  const overspend = useMemo(() => {
    if (!monthlyBudget) return 0
    return Math.max(0, forecast.predictedExpense - monthlyBudget)
  }, [forecast.predictedExpense, monthlyBudget])

  const dailyBudget = useMemo(() => {
    if (!monthlyBudget || monthlyBudget <= 0) return null
    const monthStart = monthStartFromKey(monthKey)
    const totalDays = daysInMonth(monthStart)
    const today = new Date()
    const dayIndex = isSameMonth(today, monthStart) ? Math.max(1, today.getDate()) : totalDays

    const todaySpent = records
      .filter((r) => r.type === 'expense' && r.amount > 0 && isSameDay(r.date, new Date(monthStart.getFullYear(), monthStart.getMonth(), dayIndex)))
      .reduce((s, r) => s + r.amount, 0)

    const todayLimit = monthlyBudget / totalDays
    const todayDelta = todayLimit - todaySpent

    const timeProgress = dayIndex / totalDays
    const spendProgress = monthStats.expense / monthlyBudget
    const diff = spendProgress - timeProgress
    const speedHint = diff > 0.03 ? '支出过快' : '节奏正常'

    return {
      totalDays,
      dayIndex,
      todayLimit,
      todaySpent,
      todayDelta,
      timeProgress,
      spendProgress,
      diff,
      speedHint,
    }
  }, [monthKey, monthStats.expense, monthlyBudget, records])

  const historySync = useMemo(() => {
    if (!monthlyBudget || monthlyBudget <= 0) return { ok: false, reason: 'no_budget', top: [] }
    const thisMonthStart = monthStartFromKey(monthKey)
    const lastKey = monthKeyPrev(monthKey)
    const lastMonthStart = monthStartFromKey(lastKey)

    const lastExpenses = records.filter((r) => isSameMonth(r.date, lastMonthStart) && r.type === 'expense' && r.amount > 0)
    const lastTotal = lastExpenses.reduce((s, r) => s + r.amount, 0)
    if (lastExpenses.length === 0 || lastTotal <= 0) return { ok: false, reason: 'no_last', top: [] }

    const ratioByCat = new Map()
    for (const r of lastExpenses) {
      const k = r.category || '其他'
      ratioByCat.set(k, (ratioByCat.get(k) ?? 0) + r.amount)
    }

    const thisExpenses = records.filter((r) => isSameMonth(r.date, thisMonthStart) && r.type === 'expense' && r.amount > 0)
    const thisByCat = new Map()
    for (const r of thisExpenses) {
      const k = r.category || '其他'
      thisByCat.set(k, (thisByCat.get(k) ?? 0) + r.amount)
    }

    const rows = Array.from(ratioByCat.entries())
      .map(([category, amt]) => {
        const ratio = amt / lastTotal
        const recommended = monthlyBudget * ratio
        const spent = thisByCat.get(category) ?? 0
        const used = recommended > 0 ? spent / recommended : 0
        return { category, ratio, recommended, spent, used }
      })
      .filter((x) => x.recommended > 0)
      .sort((a, b) => b.used - a.used)

    return { ok: true, reason: '', lastKey, top: rows.slice(0, 3) }
  }, [monthKey, monthlyBudget, records])

  const historyRows = useMemo(() => {
    const reviews = getAiMonthlyReviews()
    return monthlySummary.months.map((m) => ({
      ...m,
      review: reviews?.[m.month]?.text || '',
    }))
  }, [monthlySummary.months])

  useEffect(() => {
    if (!monthlyBudget || monthlyBudget <= 0) {
      setAiTip('')
      setAiTipError('')
      setAiTipLoading(false)
      return
    }

    const settings = getAiSettings()
    const url = resolveChatCompletionsUrl(settings.baseUrl)
    const apiKey = settings.apiKey
    const model = settings.model || 'deepseek-chat'

    if (!apiKey || !url) {
      setAiTip('')
      setAiTipError('')
      setAiTipLoading(false)
      return
    }

    const controller = new AbortController()
    const run = async () => {
      setAiTipLoading(true)
      setAiTipError('')
      try {
        const status = overspend > 0 ? '将超支' : '预计可控'
        const userPrompt =
          `本月预算：¥${monthlyBudget.toFixed(0)}，` +
          `当前支出：¥${monthStats.expense.toFixed(0)}（已过${forecast.elapsedDays}/${forecast.totalDays}天），` +
          `预测月底支出：¥${forecast.predictedExpense.toFixed(0)}，状态：${status}。` +
          (overspend > 0 ? `预计超支¥${overspend.toFixed(0)}。` : '')

        const resp = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.6,
            messages: [
              {
                role: 'system',
                content:
                  '你是温和幽默的理财小助手。请输出一句中文建议，不超过20个字。不要讽刺，超支过多可略带调侃但要友好。',
              },
              { role: 'user', content: userPrompt },
            ],
          }),
        })

        const json = await resp.json().catch(() => null)
        if (!resp.ok) {
          const msg = json?.error?.message || `AI 锦囊请求失败（HTTP ${resp.status}）`
          throw new Error(msg)
        }
        const text = String(json?.choices?.[0]?.message?.content || '').trim()
        setAiTip(text.slice(0, 40))
      } catch (e) {
        if (e?.name === 'AbortError') return
        setAiTip('')
        setAiTipError(e?.message || 'AI 锦囊生成失败')
      } finally {
        setAiTipLoading(false)
      }
    }

    run()
    return () => controller.abort()
  }, [monthKey, monthlyBudget, monthStats.expense, forecast.elapsedDays, forecast.totalDays, forecast.predictedExpense, overspend, aiTipNonce])

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="grid gap-4 md:grid-cols-5">
        <div className="app-card rounded-3xl border p-6 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium !text-slate-900 dark:!text-white">赛博存钱罐总额</div>
              <div className="mt-2 text-2xl font-semibold !text-slate-900 dark:!text-white">
                ¥ {formatCurrency(Math.abs(totalNetWorth))}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {totalNetWorth >= 0 ? '已累计财富' : '当前财务缺口'}
              </div>
            </div>
            <PiggyBank size={20} className="accent-text" />
          </div>
        </div>

        <div className="app-card rounded-3xl border p-6 shadow-soft">
          <div className="text-sm font-medium !text-slate-900 dark:!text-white">本月总收入</div>
          <div className="mt-2 text-2xl font-semibold !text-slate-900 dark:!text-white">
            ¥ {formatCurrency(monthStats.income)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">只统计本月记账</div>
        </div>
        <div className="app-card rounded-3xl border p-6 shadow-soft">
          <div className="text-sm font-medium !text-slate-900 dark:!text-white">本月总支出</div>
          <div className="mt-2 text-2xl font-semibold !text-slate-900 dark:!text-white">
            ¥ {formatCurrency(monthStats.expense)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">支出越高不一定越糟</div>
        </div>
        <div className="app-card rounded-3xl border p-6 shadow-soft">
          <div className="text-sm font-medium text-slate-900 dark:text-white">当前余额</div>
          <div
            className={
              monthStats.balance < 0
                ? 'mt-2 text-2xl font-bold text-rose-600'
                : 'mt-2 text-2xl font-semibold text-slate-900 dark:text-white'
            }
          >
            ¥ {formatCurrency(monthStats.balance)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">收入 - 支出</div>
        </div>

        <div className="app-card rounded-3xl border p-6 shadow-soft">
          <div className="text-sm font-medium text-slate-900 dark:text-white">本月冲动消费总额</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">¥ {formatCurrency(impulsiveSpend)}</div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Coffee size={14} />
            这些冲动消费够你买 {(impulsiveSpend / 30).toFixed(0)} 杯奶茶了。
          </div>
        </div>
      </div>

      {lastMonthCarry ? (
        <div className="app-card mt-4 rounded-3xl border bg-gradient-to-br from-[var(--accent-soft)] to-white p-5 text-sm text-slate-700 shadow-sm dark:from-white/5 dark:to-[#0F172A] dark:text-slate-200">
          上月省下了 ¥{formatCurrency(lastMonthCarry.balance)}，已自动转入存钱罐。本月请继续加油！
        </div>
      ) : null}

      <div className="app-card mt-4 rounded-3xl border p-6 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">本月预算</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">用进度条盯住支出节奏</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">预算金额</div>
            <input
              type="number"
              inputMode="decimal"
              step="1"
              value={monthlyBudget || ''}
              onChange={(e) => {
                const v = Number(e.target.value)
                setMonthlyBudget(Number.isFinite(v) ? v : 0)
              }}
              onBlur={() => setBudgetSettings({ monthKey, monthlyBudget })}
              placeholder="例如：3000"
              className="w-40 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 outline-none transition focus:border-slate-300 focus:shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100"
            />
          </div>
        </div>

        {monthlyBudget > 0 ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <div className="font-semibold text-slate-900 dark:text-white">
                ¥ {formatCurrency(monthStats.expense)} / ¥ {formatCurrency(monthlyBudget)}
              </div>
              <div className="text-slate-500 dark:text-slate-400">{budgetRate.toFixed(0)}%</div>
            </div>
            <div className="mt-3 h-3 w-full rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className={
                  budgetRate >= 100
                    ? 'h-3 rounded-full bg-rose-500'
                    : budgetRate >= 80
                      ? 'h-3 rounded-full bg-[#2DD4BF]'
                      : 'h-3 rounded-full accent-bg'
                }
                style={{ width: `${Math.min(100, Math.max(0, budgetRate))}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">80% 预警，100% 超支</div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_0.48fr]">
              <div className="app-card rounded-2xl border p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">月末支出预测</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      日均支出 ¥{forecast.dailyExpense.toFixed(0)}，预测月底 ¥{forecast.predictedExpense.toFixed(0)}
                    </div>
                  </div>
                  {overspend > 0 ? (
                    <div className="flex items-center gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                      <AlertTriangle size={14} />
                      预警：月底将超支 ¥{formatCurrency(overspend)}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                      预计可控
                    </div>
                  )}
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <div>已花</div>
                      <div>¥ {formatCurrency(monthStats.expense)}</div>
                    </div>
                    <div className="relative h-3 w-full rounded-full bg-slate-100 dark:bg-white/10">
                      <div
                        className="h-3 rounded-full accent-bg transition-[width] duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, (monthStats.expense / monthlyBudget) * 100))}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <div>预测月底</div>
                      <div>¥ {formatCurrency(forecast.predictedExpense)}</div>
                    </div>
                    <div className="relative h-3 w-full rounded-full bg-slate-100 dark:bg-white/10">
                      <div
                        className="h-3 rounded-full border border-dashed accent-border accent-bg-soft transition-[width] duration-500"
                        style={{
                          width: `${Math.min(100, Math.max(0, (forecast.predictedExpense / monthlyBudget) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="app-card rounded-2xl border bg-gradient-to-br from-[var(--accent-soft)] to-white p-4 dark:from-white/5 dark:to-[#0F172A]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-xl bg-white/80 shadow-sm dark:bg-white/10">
                      <Bot size={14} className="accent-text" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-white">AI 锦囊</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                        {aiTipLoading
                          ? '生成中…'
                          : aiTip
                            ? aiTip
                            : aiTipError
                              ? '暂时生成失败'
                              : '配置 Key 后自动生成'}
                      </div>
                      {aiTipError ? <div className="mt-1 text-xs text-rose-600">{aiTipError}</div> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiTipNonce((v) => v + 1)}
                    className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                    aria-label="刷新锦囊"
                    title="刷新锦囊"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">使用你在 AI 诊疗室配置的 BYOK。</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="app-card rounded-2xl border p-4">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">今日财务状态</div>
                {dailyBudget ? (
                  <div className="mt-3 grid gap-2 text-sm">
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                      <div className="text-slate-500 dark:text-slate-400">今日限额</div>
                      <div className="font-semibold text-slate-900 dark:text-white">¥ {formatCurrency(dailyBudget.todayLimit)}</div>
                    </div>
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                      <div className="text-slate-500 dark:text-slate-400">今日已花</div>
                      <div className="font-semibold text-slate-900 dark:text-white">¥ {formatCurrency(dailyBudget.todaySpent)}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-slate-500 dark:text-slate-400">今日结余</div>
                      <div className={dailyBudget.todayDelta < 0 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-700'}>
                        {dailyBudget.todayDelta < 0 ? '-' : ''}¥ {formatCurrency(Math.abs(dailyBudget.todayDelta))}
                      </div>
                    </div>
                    <div className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                      时间进度 {(dailyBudget.timeProgress * 100).toFixed(0)}% · 支出进度 {(dailyBudget.spendProgress * 100).toFixed(0)}% · 结论：
                      <span
                        className={
                          dailyBudget.diff > 0.03 ? 'ml-1 font-semibold text-rose-700 dark:text-rose-200' : 'ml-1 font-semibold text-slate-900 dark:text-white'
                        }
                      >
                        {dailyBudget.speedHint}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">请先设置预算，开启日均预算监控。</div>
                )}
              </div>

              <div className="app-card rounded-2xl border p-4">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">历史同步预警</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">基于上月类目占比，为本月生成推荐限额</div>
                {!historySync.ok ? (
                  <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    {historySync.reason === 'no_last' ? '数据累积中，下月开启历史分析。' : '请先设置预算，开启历史预测。'}
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {historySync.top.map((x) => {
                      const pct = Math.min(999, Math.max(0, x.used * 100))
                      const warn = pct >= 80
                      return (
                        <div key={x.category} className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900 dark:text-white">{x.category}</div>
                              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                ¥ {formatCurrency(x.spent)} / ¥ {formatCurrency(x.recommended)}（{pct.toFixed(0)}%）
                              </div>
                            </div>
                            <div
                              className={
                                warn
                                  ? 'rounded-2xl bg-[#2DD4BF]/15 px-3 py-1.5 text-xs font-semibold text-[#0F766E] dark:text-[#5EEAD4]'
                                  : 'rounded-2xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                              }
                            >
                              {warn ? '接近配额' : '在轨道'}
                            </div>
                          </div>
                          <div className="mt-2 h-2 w-full rounded-full bg-white dark:bg-white/10">
                            <div
                              className={warn ? 'h-2 rounded-full bg-[#2DD4BF] transition-[width] duration-500' : 'h-2 rounded-full accent-bg transition-[width] duration-500'}
                              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 dark:border-white/20 dark:bg-white/5 dark:text-slate-400">
            请先设置预算，开启预测功能。
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="app-card rounded-3xl border p-6 shadow-soft">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white">金额波动 × 情绪指数</div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">最近 14 笔（支出显示为负数）</div>
            </div>
          </div>

          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="4 6" stroke={chartGrid} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: chartText }} stroke={chartAxis} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12, fill: chartText }}
                  stroke={chartAxis}
                  tickFormatter={(v) => `${v}`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[1, 5]}
                  tick={{ fontSize: 12, fill: chartText }}
                  stroke={chartAxis}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 16,
                    backgroundColor: theme === 'dark' ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.98)',
                    border: theme === 'dark' ? '1px solid rgba(255,255,255,0.18)' : '1px solid #e2e8f0',
                    boxShadow: theme === 'dark' ? '0 0 0 rgba(0,0,0,0)' : '0 10px 30px rgba(2,6,23,0.08)',
                  }}
                  labelStyle={{ color: theme === 'dark' ? 'rgba(255,255,255,0.85)' : '#0f172a' }}
                  itemStyle={{ color: theme === 'dark' ? 'rgba(226,232,240,0.95)' : '#0f172a' }}
                  formatter={(value, name) => {
                    if (name === 'emotionScore') return [value, '情绪指数']
                    return [value, '金额']
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="amount"
                  stroke={theme === 'dark' ? '#E2E8F0' : '#0f172a'}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="emotionScore"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="app-card rounded-3xl border p-6 shadow-soft">
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">财务健康雷达图</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">一眼看到本月的“财务人格”</div>
          </div>

          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 0, left: 20 }}>
                <PolarGrid stroke={chartGrid} />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12, fill: chartText }} stroke={chartAxis} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 11, fill: chartText }} stroke={chartAxis} />
                <Radar
                  dataKey="value"
                  stroke="var(--accent)"
                  fill="var(--accent-radar-fill)"
                  fillOpacity={1}
                  strokeWidth={3}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="app-card mt-4 rounded-3xl border p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 shadow-sm dark:bg-white/10">
                <PersonaIcon size={18} className="text-slate-900 dark:text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">财务人格勋章</div>
                <div className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{personaBadge.title}</div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{personaBadge.desc}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">最近账单</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">最近 10 笔</div>
          </div>
          <button
            type="button"
            onClick={() => setOnlyRegret((v) => !v)}
            className={
              onlyRegret
                ? 'rounded-2xl accent-bg px-4 py-2 text-sm font-semibold text-white shadow-sm'
                : 'app-card rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10'
            }
          >
            只看高后悔支出
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          {recent.length === 0 ? (
            <div className="app-card rounded-3xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/20 dark:text-slate-400">
              {onlyRegret ? '没有符合条件的记录。' : '还没有任何记录。先去「记账」页记一笔吧。'}
            </div>
          ) : (
            recent.map((r) => (
              <div
                key={r.id}
                className="app-card rounded-3xl border border-slate-200 p-5 shadow-sm transition hover:shadow-soft dark:border-white/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{r.category}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(r.date)}</div>
                    </div>
                    {r.note ? <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">{r.note}</div> : null}
                    <div className="mt-3">
                      <Stars value={r.emotionScore} onChange={null} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm('确认删除这条记录吗？此操作不可撤销。')
                        if (!ok) return
                        deleteRecord(r.id)
                      }}
                      className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                      aria-label="删除记录"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                    <div
                      className={
                        r.type === 'income'
                          ? 'rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                          : 'rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200'
                      }
                    >
                      {r.type === 'income' ? '+' : '-'}¥ {formatCurrency(r.amount)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="app-card mt-8 rounded-3xl border p-6 shadow-soft">
        <div className="text-lg font-semibold text-slate-900 dark:text-white">历史月度账单</div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">按月汇总收入、支出与结余</div>

        {historyRows.length === 0 ? (
          <div className="app-card mt-4 rounded-3xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/20 dark:text-slate-400">
            还没有任何记录。存钱罐显示为 ¥0。
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            {historyRows.map((m) => {
              const open = historyOpen === m.month
              return (
                <div key={m.month} className="app-card rounded-3xl border border-slate-200 shadow-sm dark:border-white/20">
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((cur) => (cur === m.month ? '' : m.month))}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{formatMonthLabel(m.month)}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        收入 ¥{formatCurrency(m.income)} · 支出 ¥{formatCurrency(m.expense)}
                      </div>
                    </div>
                    <div
                      className={
                        m.balance >= 0
                          ? 'rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                          : 'rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200'
                      }
                    >
                      {m.balance >= 0 ? '+' : '-'}¥ {formatCurrency(Math.abs(m.balance))}
                    </div>
                  </button>

                  {open ? (
                    <div className="border-t border-slate-200 px-5 py-4 dark:border-white/20">
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">AI 历史评价</div>
                      {m.review ? (
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">{m.review}</div>
                      ) : (
                        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">暂无该月评价（你可以在 AI 诊疗室生成后自动保存）。</div>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
