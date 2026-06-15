import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clearRecords,
  getRecords,
  getAiSettings,
  getBudgetSettingsForMonth,
  setAiMonthlyReview,
  setAiSettings,
  subscribeRecords,
  subscribeSettings,
} from '../lib/storage'
import { isWithinDays } from '../lib/date'
import Toast from '../components/Toast'
import { Info } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEFAULT_MODEL = 'deepseek-chat'
const TIMEOUT_MS = 25000

const DEFAULT_PERSONA =
  '你是一个毒舌又专业的财务心理导师，请根据我的记账和情绪数据，用犀利幽默的语气指出我的财务漏洞。'

const MODEL_PRESETS = [
  { key: 'deepseek', label: 'DeepSeek（推荐）', value: 'deepseek-chat' },
  { key: 'glm', label: '智谱 GLM-4', value: 'glm-4' },
  { key: 'gpt4omini', label: 'OpenAI GPT-4o-mini', value: 'gpt-4o-mini' },
  { key: 'custom', label: '自定义（Custom）', value: '' },
]

const PERSONA_PRESETS = [
  {
    key: 'money-buddy',
    label: '金钱嘴替',
    text: '你是一个懂生活、真诚且爱开玩笑的好朋友。你的任务是分析用户的收支与情绪。如果用户花钱买了快乐，请给予肯定；如果用户因为冲动而后悔，请温柔地帮他分析原因。多使用年轻人的口吻，不要说教。',
  },
  {
    key: 'clear-minded',
    label: '人间清醒',
    text: '你是一个幽默、机智的脱口秀演员。请用调侃、反讽但不过分毒舌的方式，点出用户数据中的非理性消费。你的目标是让用户在笑声中意识到自己的财务问题。',
  },
  {
    key: 'cyber-narrator',
    label: '赛博旁白',
    text: '你是一个硬核 RPG 游戏的系统旁白。将收入视为血量补给，支出视为怪物攻击。用游戏术语（如：Debuff、副本、经验值）来分析用户的财务状态，让理财变得像打副本一样有趣。',
  },
  {
    key: 'minimal-coach',
    label: '极简教练',
    text: '你是一个追求效率、崇尚极简主义的理财专家。请理性、专业地分析用户的消费回报率。重点关注哪些支出是真正的‘生活必需’，哪些是‘多巴胺噪音’。语言要简洁、高级。',
  },
]

function pad2(n) {
  return String(n).padStart(2, '0')
}

function monthKeyFromDate(d) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`
}

function monthKeyPrev(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map((x) => Number(x))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKeyFromDate(new Date())
  return monthKeyFromDate(new Date(y, m - 2, 1))
}

function daysInMonthFromKey(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map((x) => Number(x))
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 30
  return new Date(y, m, 0).getDate()
}

function isSameMonthKey(iso, monthKey) {
  return monthKeyFromDate(iso) === monthKey
}

function isSameDay(iso, y, mIndex0, day) {
  const d = new Date(iso)
  return d.getFullYear() === y && d.getMonth() === mIndex0 && d.getDate() === day
}

function inferPresetFromModel(model) {
  const m = String(model || '').trim()
  const hit = MODEL_PRESETS.find((p) => p.value && p.value === m)
  return hit?.key || 'custom'
}

function inferPersonaPresetFromPersona(persona) {
  const p = String(persona || '').trim()
  const hit = PERSONA_PRESETS.find((x) => String(x.text).trim() === p)
  return hit?.key || 'custom'
}

function normalizeBaseUrl(input) {
  const raw = String(input || '').trim()
  return raw.replace(/。+$/g, '')
}

function resolveChatCompletionsUrl(input) {
  const url = normalizeBaseUrl(input)
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Base URL 不合法，请填写完整的 http(s) 地址')
  }

  const noTrail = url.replace(/\/+$/g, '')
  if (/\/v1\/chat\/completions$/i.test(noTrail)) return noTrail
  if (/\/v1$/i.test(noTrail)) return `${noTrail}/chat/completions`
  return `${noTrail}/v1/chat/completions`
}

// 将最近 7 天的数据汇总成“概览一句话”，作为 User Prompt 的开头摘要
function summarizeWeek(records) {
  const week = records.filter((r) => isWithinDays(r.date, 7))
  const totals = {
    count: week.length,
    income: 0,
    expense: 0,
    incomeEmotionSum: 0,
    expenseEmotionSum: 0,
    incomeCount: 0,
    expenseCount: 0,
  }

  const expenseByCategory = new Map()
  const incomeByCategory = new Map()

  for (const r of week) {
    if (r.type === 'income') {
      totals.income += r.amount
      totals.incomeEmotionSum += r.emotionScore
      totals.incomeCount += 1
      incomeByCategory.set(r.category, (incomeByCategory.get(r.category) ?? 0) + r.amount)
    } else {
      totals.expense += r.amount
      totals.expenseEmotionSum += r.emotionScore
      totals.expenseCount += 1
      expenseByCategory.set(r.category, (expenseByCategory.get(r.category) ?? 0) + r.amount)
    }
  }

  const incomeAvg = totals.incomeCount ? totals.incomeEmotionSum / totals.incomeCount : 0
  const expenseAvg = totals.expenseCount ? totals.expenseEmotionSum / totals.expenseCount : 0

  function topCats(map) {
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k]) => k)
      .filter(Boolean)
  }

  const topExpense = topCats(expenseByCategory)
  const topIncome = topCats(incomeByCategory)

  const parts = []
  parts.push(`我这周共记了${totals.count}笔账`)
  parts.push(`收入¥${totals.income.toFixed(2)}（平均劳累${incomeAvg.toFixed(1)}/5）`)
  parts.push(`支出¥${totals.expense.toFixed(2)}（平均冲动${expenseAvg.toFixed(1)}/5）`)
  if (topIncome.length) parts.push(`主要收入来自：${topIncome.join('、')}`)
  if (topExpense.length) parts.push(`主要支出花在：${topExpense.join('、')}`)
  return `${parts.join('，')}。`
}

// 将最近 7 天的流水逐条打包成可读文本（包含备注），让 AI 能基于“动机”分析
function buildWeeklyDetails(records) {
  const week = records.filter((r) => isWithinDays(r.date, 7))
  return week.slice(0, 60).map((r) => {
    const kind = r.type === 'income' ? '收入' : '支出'
    const amount = Number(r.amount || 0).toFixed(2)
    const category = r.category || '其他'
    const emotion = Number(r.emotionScore || 0)
    const date = r.date || ''
    const note = r.note ? String(r.note) : '无'
    if (r.type === 'income') {
      return `${kind}：${amount}元，分类：${category}，劳累程度 (1为非常轻松, 5为极其疲惫)：${emotion}，日期：${date}，备注：${note}`
    }
    return `${kind}：${amount}元，分类：${category}，冲动程度 (1为极其理性, 5为极其冲动)：${emotion}，日期：${date}，备注：${note}`
  })
}

// 将“预算监控 + 上月类目占比”打包成一段上下文，让 AI 能给出更可执行的建议
function buildBudgetAndHistoryPack(records) {
  const monthKey = monthKeyFromDate(new Date())
  const { monthlyBudget } = getBudgetSettingsForMonth(monthKey)
  if (!monthlyBudget || monthlyBudget <= 0) {
    return { monthKey, text: '预算监控：未设置本月预算（预算相关分析跳过）。' }
  }

  const totalDays = daysInMonthFromKey(monthKey)
  const today = new Date()
  const curKey = monthKeyFromDate(today)
  const dayIndex = curKey === monthKey ? Math.max(1, today.getDate()) : totalDays
  const todayLimit = monthlyBudget / totalDays

  const [y, m] = monthKey.split('-').map((x) => Number(x))
  const mIndex0 = (Number(m) || 1) - 1

  const thisMonthExpenses = records.filter(
    (r) => isSameMonthKey(r.date, monthKey) && r.type === 'expense' && r.amount > 0,
  )
  const thisMonthTotal = thisMonthExpenses.reduce((s, r) => s + r.amount, 0)
  const todaySpent = thisMonthExpenses
    .filter((r) => isSameDay(r.date, y, mIndex0, dayIndex))
    .reduce((s, r) => s + r.amount, 0)
  const todayDelta = todayLimit - todaySpent

  const timeProgress = dayIndex / totalDays
  const spendProgress = thisMonthTotal / monthlyBudget
  const diff = spendProgress - timeProgress
  const speedHint = diff > 0.03 ? '支出进度快于时间进度（支出过快）' : '支出节奏与时间进度大致一致'

  const lastKey = monthKeyPrev(monthKey)
  const lastMonthExpenses = records.filter(
    (r) => isSameMonthKey(r.date, lastKey) && r.type === 'expense' && r.amount > 0,
  )
  const lastTotal = lastMonthExpenses.reduce((s, r) => s + r.amount, 0)

  const byCatLast = new Map()
  for (const r of lastMonthExpenses) {
    const k = r.category || '其他'
    byCatLast.set(k, (byCatLast.get(k) ?? 0) + r.amount)
  }

  const byCatThis = new Map()
  for (const r of thisMonthExpenses) {
    const k = r.category || '其他'
    byCatThis.set(k, (byCatThis.get(k) ?? 0) + r.amount)
  }

  let historyText = '上月类目预判：数据累积中，下月开启历史分析。'
  if (lastTotal > 0 && byCatLast.size > 0) {
    const rows = Array.from(byCatLast.entries())
      .map(([category, amt]) => {
        const ratio = amt / lastTotal
        const recommended = monthlyBudget * ratio
        const spent = byCatThis.get(category) ?? 0
        const used = recommended > 0 ? spent / recommended : 0
        return { category, ratio, recommended, spent, used }
      })
      .sort((a, b) => b.used - a.used)
      .slice(0, 5)

    historyText =
      `上月类目占比（${lastKey}）：` +
      rows
        .map((r) => `${r.category} ${(r.ratio * 100).toFixed(0)}%`)
        .join('，') +
      `。\n本月推荐限额（基于预算 ¥${monthlyBudget.toFixed(0)}）：` +
      rows
        .slice(0, 3)
        .map(
          (r) =>
            `${r.category} 已用¥${r.spent.toFixed(0)}/¥${r.recommended.toFixed(0)}（${(r.used * 100).toFixed(0)}%）`,
        )
        .join('，') +
      '。'
  }

  const text =
    `预算监控（本月 ${monthKey}）：预算¥${monthlyBudget.toFixed(0)}，月天数${totalDays}，` +
    `今日限额¥${todayLimit.toFixed(0)}，今日已花¥${todaySpent.toFixed(0)}，` +
    `今日结余${todayDelta >= 0 ? '¥' : '-¥'}${Math.abs(todayDelta).toFixed(0)}，` +
    `时间进度${(timeProgress * 100).toFixed(0)}%，支出进度${(spendProgress * 100).toFixed(0)}%，${speedHint}。\n` +
    historyText

  return { monthKey, text }
}

function extractMotto(text) {
  const raw = String(text || '')
  const line = raw.match(/^\s*座右铭[:：]\s*(.+)\s*$/m)?.[1]
  if (line) return line.trim().slice(0, 80)

  const quote = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('>'))
    .at(-1)
  if (quote) return quote.replace(/^>\s*/, '').trim().slice(0, 80)

  const last = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .at(-1)
  return last ? last.slice(0, 80) : ''
}

function parseAgentSteps(text) {
  const raw = String(text || '').trim()
  if (!raw) return { thought: '', advice: '' }

  const h1 = raw.match(/^###\s*.*Step\s*1\b.*$/im)
  const h2 = raw.match(/^###\s*.*Step\s*2\b.*$/im)
  const h3 = raw.match(/^###\s*.*Step\s*3\b.*$/im)

  const i1 = h1?.index ?? -1
  const i2 = h2?.index ?? -1
  const i3 = h3?.index ?? -1

  if (i3 < 0) return { thought: '', advice: raw }
  const thoughtStart = i1 >= 0 ? i1 : i2 >= 0 ? i2 : 0
  const thought = raw.slice(thoughtStart, i3).trim()
  const advice = raw.slice(i3).trim()
  return { thought, advice }
}

class ApiError extends Error {
  constructor(message, options) {
    super(message)
    this.name = 'ApiError'
    this.status = options?.status || 0
    this.kind = options?.kind || 'unknown'
  }
}

// 调用 OpenAI 兼容接口（/v1/chat/completions）。
// 增强点：超时控制、网络错误识别、HTTP 状态码透传（供 UI 做友好提示）。
async function callOpenAICompatible({ baseUrl, apiKey, model, systemPrompt, userPrompt }) {
  const url = resolveChatCompletionsUrl(baseUrl)
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), TIMEOUT_MS)

  let resp
  try {
    resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new ApiError('请求超时', { kind: 'timeout', status: 0 })
    }
    throw new ApiError('网络请求失败', { kind: 'network', status: 0 })
  } finally {
    window.clearTimeout(timeoutId)
  }

  const json = await resp.json().catch(() => null)
  if (!resp.ok) {
    const msg = json?.error?.message || `请求失败（HTTP ${resp.status}）`
    throw new ApiError(msg, { kind: 'http', status: resp.status })
  }
  const text = json?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    throw new ApiError('未拿到有效的 AI 返回内容', { kind: 'bad_response', status: resp.status })
  }
  return text.trim()
}

export default function AiTherapistPage() {
  const [records, setRecords] = useState(() => getRecords())
  const [settings, setSettings] = useState(() => {
    const s = getAiSettings()
    const model = s.model || DEFAULT_MODEL
    const modelPreset = s.modelPreset || inferPresetFromModel(model)
    const persona = s.persona || DEFAULT_PERSONA
    const personaPreset = inferPersonaPresetFromPersona(persona)
    return {
      apiKey: s.apiKey,
      baseUrl: s.baseUrl || DEFAULT_BASE_URL,
      model,
      modelPreset,
      persona,
      personaPreset,
    }
  })

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [thoughtText, setThoughtText] = useState('')
  const [adviceText, setAdviceText] = useState('')
  const [displayText, setDisplayText] = useState('')
  const [motto, setMotto] = useState('')
  const [resultTone, setResultTone] = useState('ok')
  const [toast, setToast] = useState({ open: false, type: 'success', message: '' })
  const [loadingHint, setLoadingHint] = useState('')
  const typerRef = useRef(null)

  function stopTyper() {
    if (!typerRef.current) return
    cancelAnimationFrame(typerRef.current)
    typerRef.current = null
  }

  useEffect(() => {
    setRecords(getRecords())
    return subscribeRecords(() => setRecords(getRecords()))
  }, [])

  useEffect(() => {
    const seed = getAiSettings()
    if (!seed.baseUrl || !seed.model || !seed.modelPreset) {
      const seedModel = seed.model || DEFAULT_MODEL
      setAiSettings({
        apiKey: seed.apiKey,
        persona: seed.persona || DEFAULT_PERSONA,
        baseUrl: seed.baseUrl || DEFAULT_BASE_URL,
        model: seedModel,
        modelPreset: seed.modelPreset || inferPresetFromModel(seedModel),
      })
    }

    setSettings((prev) => {
      const next = getAiSettings()
      const nextModel = next.model || prev.model || DEFAULT_MODEL
      const nextPreset = next.modelPreset || prev.modelPreset || inferPresetFromModel(nextModel)
      const nextPersona = next.persona || prev.persona || DEFAULT_PERSONA
      return {
        ...prev,
        apiKey: next.apiKey,
        baseUrl: next.baseUrl || prev.baseUrl || DEFAULT_BASE_URL,
        model: nextModel,
        modelPreset: nextPreset,
        persona: nextPersona,
        personaPreset: inferPersonaPresetFromPersona(nextPersona),
      }
    })
    return subscribeSettings(() => {
      const next = getAiSettings()
      const nextModel = next.model || DEFAULT_MODEL
      const nextPreset = next.modelPreset || inferPresetFromModel(nextModel)
      const nextPersona = next.persona || DEFAULT_PERSONA
      setSettings((prev) => ({
        ...prev,
        apiKey: next.apiKey,
        baseUrl: next.baseUrl || prev.baseUrl || DEFAULT_BASE_URL,
        model: nextModel || prev.model || DEFAULT_MODEL,
        modelPreset: nextPreset || prev.modelPreset || inferPresetFromModel(nextModel),
        persona: nextPersona || prev.persona || DEFAULT_PERSONA,
        personaPreset: inferPersonaPresetFromPersona(nextPersona),
      }))
    })
  }, [])

  useEffect(() => {
    if (!adviceText) return
    stopTyper()
    setDisplayText('')
    const text = adviceText
    const start = performance.now()
    const duration = Math.min(5200, Math.max(900, text.length * 18))
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const len = Math.max(1, Math.floor(eased * text.length))
      setDisplayText(text.slice(0, len))
      if (t < 1) {
        typerRef.current = requestAnimationFrame(tick)
      } else {
        typerRef.current = null
      }
    }
    typerRef.current = requestAnimationFrame(tick)
    return () => {
      stopTyper()
    }
  }, [adviceText])

  useEffect(() => {
    if (!loading) {
      setLoadingHint('')
      return
    }
    const steps = ['正在读取账单数据...', '正在进行情绪建模...', '正在生成干预策略...', '即将完成...']
    let i = 0
    setLoadingHint(steps[i])
    const id = window.setInterval(() => {
      i = (i + 1) % steps.length
      setLoadingHint(steps[i])
    }, 1000)
    return () => window.clearInterval(id)
  }, [loading])

  const hasData = records.length > 0

  const userPrompt = useMemo(() => {
    const summary = summarizeWeek(records)
    const details = buildWeeklyDetails(records)
    const pack = buildBudgetAndHistoryPack(records)
    if (details.length === 0) return `${summary}\n\n${pack.text}`
    return `${summary}\n\n最近 7 天流水（包含备注，请逐条阅读）：\n${details.map((x) => `- ${x}`).join('\n')}\n\n${pack.text}`
  }, [records])

  function showToast(next) {
    setToast({ open: true, ...next })
  }

  function closeToast() {
    setToast((t) => ({ ...t, open: false }))
  }

  async function onSaveSettings() {
    setSaving(true)
    try {
      const modelPreset = settings.modelPreset || inferPresetFromModel(settings.model)
      const model =
        modelPreset === 'custom'
          ? String(settings.model || '').trim()
          : MODEL_PRESETS.find((p) => p.key === modelPreset)?.value || DEFAULT_MODEL

      setAiSettings({
        apiKey: settings.apiKey,
        persona: settings.persona || DEFAULT_PERSONA,
        baseUrl: normalizeBaseUrl(settings.baseUrl || DEFAULT_BASE_URL) || DEFAULT_BASE_URL,
        model: model || DEFAULT_MODEL,
        modelPreset,
      })
      showToast({ type: 'success', message: '设置已保存到本地浏览器。' })
    } finally {
      setSaving(false)
    }
  }

  async function onGenerate() {
    const persisted = getAiSettings()
    const apiKey = settings.apiKey || persisted.apiKey
    const baseUrl = normalizeBaseUrl(settings.baseUrl || persisted.baseUrl || DEFAULT_BASE_URL) || DEFAULT_BASE_URL
    const model = String(
      (settings.modelPreset || persisted.modelPreset) === 'custom'
        ? settings.model || persisted.model || DEFAULT_MODEL
        : settings.model || persisted.model || DEFAULT_MODEL,
    )
      .trim()
      .replace(/^"+|"+$/g, '')
      .replace(/^'+|'+$/g, '') || DEFAULT_MODEL
    const persona = settings.persona || persisted.persona || DEFAULT_PERSONA

    const latestRecords = getRecords()
    if (!latestRecords || latestRecords.length === 0) {
      showToast({ type: 'error', message: '没有任何记账数据，先去记一笔帐吧。' })
      return
    }
    if (!String(apiKey || '').trim()) {
      showToast({ type: 'error', message: '请先在上方配置 API Key（BYOK）。' })
      return
    }
    if (!baseUrl) {
      showToast({ type: 'error', message: '请先在上方配置 Base URL。' })
      return
    }
    if (!model) {
      showToast({ type: 'error', message: '请先在上方配置 Model Name。' })
      return
    }
    setLoading(true)
    stopTyper()
    setThoughtText('')
    setAdviceText('')
    setDisplayText('')
    setMotto('')
    try {
      setResultTone('ok')
      const systemPrompt =
        `${persona}\n\n` +
        `请深度阅读用户的备注字段，备注里隐藏了真实的消费动机和情绪细节，请基于备注给出分析，不要只看分类标签。\n\n` +
        `注意：用户的数值逻辑如下：\n` +
        `- 对于支出：‘冲动指数 1’ 代表这是一次经过深思熟虑、非常有计划的‘刚需’或‘理性消费’（如报名费、水电费），请给予表扬。\n` +
        `- 对于收入：‘劳累指数 1’ 代表这笔钱赚得很轻松，是高质量收入。\n` +
        `请根据这些数值逻辑进行分析，不要看到 1 分就认为是心情不好。\n\n` +
        `增强上下文：如果用户备注里提到了‘学习’、‘报名’、‘考试’、‘兼职’等关键词，请结合这些场景进行深度分析。例如，六级报名费是投资未来的行为，即便金额再高、冲动分再低，也是非常正面的。\n\n` +
        `请结合预算监控与上月类目预判：如果某类目已消耗其推荐限额的 80%+，请给出具体的收缩建议（温和、可执行、带一点幽默但不讽刺）。\n\n` +
        `请严格使用 Markdown，并严格按以下三个标题输出（标题文字必须完全一致）：\n` +
        `### 🔍 Step 1: 行为特征提取\n` +
        `用要点列出用户的收支结构、关键类目、冲动/劳累分布、预算节奏等“事实特征”。\n` +
        `### 🧠 Step 2: 心理动机推理\n` +
        `用要点给出基于备注与数据的动机推断（可以写“可能/倾向于”，避免过度武断）。\n` +
        `### 💡 Step 3: 行动建议生成\n` +
        `给出 3-6 条可执行建议（越具体越好），并包含 1 句“本周挑战任务”。\n\n` +
        `最后单独一行输出：座右铭：<一句话，不超过 20 字>`
      const text = await callOpenAICompatible({ baseUrl, apiKey, model, systemPrompt, userPrompt })
      const parsed = parseAgentSteps(text)
      setThoughtText(parsed.thought)
      setAdviceText(parsed.advice || text)
      setMotto(extractMotto(text))
      setAiMonthlyReview(monthKeyFromDate(new Date()), text)
    } catch (e) {
      let msg = e?.message || '生成失败，请稍后再试。'
      if (e?.status === 401) {
        msg = 'API Key 无效或未授权，请检查设置'
      } else if (e?.kind === 'timeout' || e?.kind === 'network' || (Number(e?.status || 0) >= 500 && Number(e?.status || 0) <= 599)) {
        msg = 'AI 大脑暂时宕机，请检查网络或稍后再试'
      }
      setResultTone('error')
      setThoughtText('')
      setAdviceText(`请求失败：${msg}`)
      setMotto('')
      showToast({ type: 'error', message: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="app-card rounded-3xl border p-6 shadow-soft">
          <div className="text-lg font-semibold text-slate-900 dark:text-white">AI 情绪财务诊疗室</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            BYOK 模式：密钥仅保存在你的浏览器本地，不会上传到任何服务器（除了你主动请求的 AI 接口）。
          </div>

          <div className="mt-6 grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">请输入 API Key</label>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => setSettings((s) => ({ ...s, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-300 focus:shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100"
              />
              <div className="text-xs text-slate-500 dark:text-slate-400">
                提示：如果你在公共电脑上使用，请记得用完后清空浏览器存储。
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">API 接口地址（Base URL）</label>
              <input
                type="text"
                value={settings.baseUrl}
                onChange={(e) => setSettings((s) => ({ ...s, baseUrl: e.target.value }))}
                placeholder={DEFAULT_BASE_URL}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-300 focus:shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100"
              />
              <div className="text-xs text-slate-500 dark:text-slate-400">
                建议填写到 /v1/chat/completions（OpenAI 兼容），如 DeepSeek 等国内服务。
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">模型名称（Model Name）</label>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={settings.modelPreset}
                  onChange={(e) => {
                    const key = e.target.value
                    const preset = MODEL_PRESETS.find((p) => p.key === key)
                    setSettings((s) => ({
                      ...s,
                      modelPreset: key,
                      model: key === 'custom' ? s.model : preset?.value || DEFAULT_MODEL,
                    }))
                  }}
                  className="min-w-[240px] flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-300 focus:shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100"
                >
                  {MODEL_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Info size={14} />
                  不同服务商对应不同模型名，请确保名称与 Base URL 匹配
                </div>
              </div>

              {settings.modelPreset === 'custom' ? (
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                  placeholder={DEFAULT_MODEL}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-300 focus:shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100"
                />
              ) : null}
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">风格选择</label>
              <div className="flex flex-wrap gap-2">
                {PERSONA_PRESETS.map((p) => {
                  const active = settings.personaPreset === p.key
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        stopTyper()
                        setThoughtText('')
                        setAdviceText('')
                        setDisplayText('')
                        setMotto('')
                        setResultTone('ok')
                        setSettings((s) => ({ ...s, persona: p.text, personaPreset: p.key }))
                        showToast({ type: 'success', message: `已切换风格：${p.label}。可以开始新的诊断了。` })
                      }}
                      className={
                        active
                          ? 'rounded-2xl accent-bg px-3 py-2 text-sm font-semibold text-white shadow-sm'
                          : 'rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
                      }
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">点击风格会自动填充下方人设，你仍然可以继续修改。</div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">定制你的专属 AI 导师</label>
              <textarea
                value={settings.persona}
                onChange={(e) => setSettings((s) => ({ ...s, persona: e.target.value, personaPreset: 'custom' }))}
                rows={5}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-300 focus:shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const ok = window.confirm('确认删除所有记账记录吗？此操作不可撤销。')
                  if (!ok) return
                  clearRecords()
                  stopTyper()
                  setThoughtText('')
                  setAdviceText('')
                  setDisplayText('')
                  setMotto('')
                  setResultTone('ok')
                  showToast({ type: 'success', message: '已删除所有记录，可以重新测试了。' })
                }}
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:bg-rose-500/25"
              >
                删除所有记录
              </button>
              <button
                type="button"
                onClick={onSaveSettings}
                disabled={saving}
                className="rounded-2xl accent-bg px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-95 disabled:opacity-60"
              >
                保存设置
              </button>
            </div>
          </div>
        </div>

        <div className="app-card rounded-3xl border bg-gradient-to-br from-[var(--accent)] to-[var(--accent-strong)] p-6 text-white shadow-soft">
          <div className="text-sm font-semibold">本周按钮</div>
          <div className="mt-2 text-sm text-white/70">
            一键生成“情绪财务诊断”，会读取最近 7 天记账数据并发送到你配置的 OpenAI 兼容接口。
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="mt-6 w-full rounded-2xl bg-white/90 px-5 py-4 text-base font-semibold text-slate-900 shadow-soft transition hover:bg-white disabled:opacity-70"
          >
            ✨ 生成本周情绪财务诊断
          </button>

          <div className="mt-6 rounded-2xl bg-white/5 p-4 text-xs text-white/70">
            你可以先不填 Key，先体验完整 UI；等需要真正调用时再配置。
          </div>
        </div>
      </div>

      <div className="app-card mt-6 rounded-3xl border p-6 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">诊断结果</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">以聊天气泡风格展示</div>
          </div>
          {loading ? (
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{loadingHint || '生成中…'}</div>
          ) : null}
        </div>

        <div className="mt-4">
          {!displayText && !loading ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-700 dark:border-white/20 dark:bg-white/5 dark:text-slate-200">
              点击上方按钮生成诊断。建议先录入几笔账单，让 AI 更有“素材”。
            </div>
          ) : (
            <div className="flex justify-end">
              <div className="w-full max-w-3xl">
                {thoughtText && resultTone !== 'error' ? (
                  <details className="app-card mb-4 rounded-3xl border border-slate-200 bg-white/70 p-5 text-slate-700 shadow-sm dark:border-white/20 dark:bg-white/5 dark:text-slate-200">
                    <summary className="cursor-pointer select-none text-sm font-semibold text-slate-900 dark:text-white">
                      Agent 思考过程
                    </summary>
                    <div className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                      <ReactMarkdown
                        components={{
                          h1: (props) => <h2 className="mb-2 mt-1 text-sm font-semibold text-slate-900 dark:text-white" {...props} />,
                          h2: (props) => <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-900 dark:text-white" {...props} />,
                          h3: (props) => <h4 className="mb-2 mt-4 text-sm font-semibold text-slate-900 dark:text-white" {...props} />,
                          p: (props) => <p className="my-2 text-slate-600 dark:text-slate-300" {...props} />,
                          ul: (props) => <ul className="my-2 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300" {...props} />,
                          ol: (props) => <ol className="my-2 list-decimal space-y-1 pl-5 text-slate-600 dark:text-slate-300" {...props} />,
                          li: (props) => <li className="leading-7" {...props} />,
                          strong: (props) => <strong className="font-semibold text-slate-900 dark:text-white" {...props} />,
                          a: ({ href, ...props }) => (
                            <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-4" {...props} />
                          ),
                          blockquote: (props) => (
                            <blockquote className="my-3 border-l-2 border-slate-300 pl-4 text-slate-600 dark:border-white/20 dark:text-slate-300" {...props} />
                          ),
                          code: ({ inline, ...props }) =>
                            inline ? (
                              <code className="rounded-xl bg-black/5 px-2 py-1 font-mono text-[0.85em] dark:bg-white/10" {...props} />
                            ) : (
                              <code className="font-mono text-[0.85em]" {...props} />
                            ),
                          pre: (props) => (
                            <pre className="my-3 overflow-x-auto rounded-2xl bg-black/5 p-4 leading-6 dark:bg-white/10" {...props} />
                          ),
                          hr: () => <div className="my-4 h-px bg-slate-200 dark:bg-white/15" />,
                        }}
                      >
                        {thoughtText}
                      </ReactMarkdown>
                    </div>
                  </details>
                ) : null}

                <div
                  className={
                    resultTone === 'error'
                      ? 'rounded-3xl bg-rose-600 px-6 py-5 text-[15px] leading-8 text-white shadow-soft'
                      : 'rounded-3xl accent-bg px-6 py-5 text-[15px] leading-8 text-white shadow-soft'
                  }
                >
                  <ReactMarkdown
                    components={{
                      h1: (props) => <h2 className="mb-2 mt-1 text-base font-semibold" {...props} />,
                      h2: (props) => <h3 className="mb-2 mt-4 text-sm font-semibold" {...props} />,
                      h3: (props) => <h4 className="mb-2 mt-4 text-sm font-semibold" {...props} />,
                      p: (props) => <p className="my-2 text-white/90" {...props} />,
                      ul: (props) => <ul className="my-2 list-disc space-y-1 pl-5 text-white/90" {...props} />,
                      ol: (props) => <ol className="my-2 list-decimal space-y-1 pl-5 text-white/90" {...props} />,
                      li: (props) => <li className="leading-7" {...props} />,
                      strong: (props) => <strong className="font-semibold text-white" {...props} />,
                      a: ({ href, ...props }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-4"
                          {...props}
                        />
                      ),
                      blockquote: (props) => (
                        <blockquote className="my-3 border-l-2 border-white/30 pl-4 text-white/90" {...props} />
                      ),
                      code: ({ inline, ...props }) =>
                        inline ? (
                          <code
                            className="rounded-xl bg-white/10 px-2 py-1 font-mono text-[0.85em] text-white/90"
                            {...props}
                          />
                        ) : (
                          <code className="font-mono text-[0.85em] text-white/90" {...props} />
                        ),
                      pre: (props) => (
                        <pre className="my-3 overflow-x-auto rounded-2xl bg-black/35 p-4 leading-6" {...props} />
                      ),
                      hr: () => <div className="my-4 h-px bg-white/15" />,
                    }}
                  >
                    {displayText || ' '}
                  </ReactMarkdown>
                </div>

                {motto && resultTone !== 'error' ? (
                  <div className="app-card mt-4 rounded-3xl border border-slate-200 p-5 shadow-sm dark:border-white/20">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">本周财务座右铭</div>
                    <div className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                      <ReactMarkdown
                        components={{
                          p: (props) => <p className="m-0 leading-7" {...props} />,
                          strong: (props) => <strong className="font-semibold" {...props} />,
                          em: (props) => <em className="italic" {...props} />,
                          a: ({ href, ...props }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-4"
                              {...props}
                            />
                          ),
                          code: ({ inline, ...props }) =>
                            inline ? (
                              <code className="rounded-lg bg-black/5 px-2 py-1 font-mono text-[0.85em] dark:bg-white/10" {...props} />
                            ) : (
                              <code className="font-mono text-[0.85em]" {...props} />
                            ),
                          pre: (props) => (
                            <pre className="mt-3 overflow-x-auto rounded-2xl bg-black/5 p-4 text-sm leading-6 dark:bg-white/10" {...props} />
                          ),
                        }}
                      >
                        {motto}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      <Toast open={toast.open} type={toast.type} message={toast.message} onClose={closeToast} />
    </div>
  )
}
