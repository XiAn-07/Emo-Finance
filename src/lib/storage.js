const RECORDS_KEY = 'records'
const AI_SETTINGS_KEY = 'ai_settings'
const BUDGET_KEY = 'budget_settings'
const AI_MONTHLY_REVIEWS_KEY = 'ai_monthly_reviews'
const PIXEL_PET_KEY = 'pixel_pet'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function monthKeyFromDateLike(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return currentMonthKey()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function clamp100(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.min(100, Math.max(0, x))
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function normalizePet(input, nowMs) {
  const p = input && typeof input === 'object' ? input : {}
  const updatedAtMs = Number.isFinite(Number(p.updatedAtMs)) ? Number(p.updatedAtMs) : nowMs
  const lastEventAtMs = Number.isFinite(Number(p.lastEventAtMs)) ? Number(p.lastEventAtMs) : updatedAtMs
  const hunger = clamp100(p.hunger ?? 100)
  const happy = clamp100(p.happy ?? 100)
  const clean = clamp100(p.clean ?? 100)
  const lastRecordAtMs = Number.isFinite(Number(p.lastRecordAtMs)) ? Number(p.lastRecordAtMs) : 0
  const lastRecordType = p.lastRecordType === 'income' ? 'income' : p.lastRecordType === 'expense' ? 'expense' : ''
  const lastRecordImpulse = Number.isFinite(Number(p.lastRecordImpulse)) ? Number(p.lastRecordImpulse) : 0
  return { hunger, happy, clean, updatedAtMs, lastEventAtMs, lastRecordAtMs, lastRecordType, lastRecordImpulse }
}

function applyPetDecay(pet, nowMs) {
  const dt = Math.max(0, nowMs - pet.updatedAtMs)
  const hours = dt / (60 * 60 * 1000)
  const next = { ...pet }
  next.hunger = clamp100(next.hunger - hours * 6)
  next.happy = clamp100(next.happy - hours * 3)
  next.clean = clamp100(next.clean - hours * 4)
  next.updatedAtMs = nowMs
  return next
}

function savePet(pet) {
  localStorage.setItem(PIXEL_PET_KEY, JSON.stringify(pet))
  window.dispatchEvent(new Event('emo-finance:pet'))
  return pet
}

export function getPixelPet() {
  const nowMs = Date.now()
  const raw = localStorage.getItem(PIXEL_PET_KEY)
  const parsed = safeJsonParse(raw ?? 'null', null)
  const pet = applyPetDecay(normalizePet(parsed, nowMs), nowMs)
  localStorage.setItem(PIXEL_PET_KEY, JSON.stringify(pet))
  return pet
}

export function updatePixelPet(updater) {
  const nowMs = Date.now()
  const current = getPixelPet()
  const next =
    typeof updater === 'function'
      ? normalizePet(updater({ ...current }), nowMs)
      : normalizePet({ ...current, ...(updater || {}) }, nowMs)
  next.updatedAtMs = nowMs
  next.lastEventAtMs = nowMs
  return savePet(next)
}

export function petFeed() {
  return updatePixelPet((p) => ({
    ...p,
    hunger: clamp100(p.hunger + 22),
    happy: clamp100(p.happy + 6),
  }))
}

export function petPlay() {
  return updatePixelPet((p) => ({
    ...p,
    happy: clamp100(p.happy + 24),
    clean: clamp100(p.clean - 6),
    hunger: clamp100(p.hunger - 4),
  }))
}

export function petWash() {
  return updatePixelPet((p) => ({
    ...p,
    clean: clamp100(p.clean + 28),
    happy: clamp100(p.happy - 3),
  }))
}

export function subscribePet(callback) {
  const handler = () => callback()
  window.addEventListener('emo-finance:pet', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('emo-finance:pet', handler)
    window.removeEventListener('storage', handler)
  }
}

export function getRecords() {
  const raw = localStorage.getItem(RECORDS_KEY)
  const parsed = safeJsonParse(raw ?? '[]', [])
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      id: typeof r.id === 'string' ? r.id : newId(),
      type: r.type === 'income' ? 'income' : 'expense',
      amount: Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0,
      category: typeof r.category === 'string' ? r.category : '其他',
      date: typeof r.date === 'string' ? r.date : new Date().toISOString(),
      emotionScore: Number.isFinite(Number(r.emotionScore))
        ? Math.min(5, Math.max(1, Math.round(Number(r.emotionScore))))
        : 3,
      note: typeof r.note === 'string' ? r.note : '',
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function setRecords(records) {
  const next = Array.isArray(records) ? records : []
  localStorage.setItem(RECORDS_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('emo-finance:records'))
  return next.length
}

export function getMonthlySummary(recordsInput) {
  const rows = Array.isArray(recordsInput) ? recordsInput : getRecords()
  const byMonth = new Map()

  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    const month = monthKeyFromDateLike(r.date)
    const prev = byMonth.get(month) ?? { month, income: 0, expense: 0, balance: 0 }
    const amount = Number(r.amount || 0)
    if (r.type === 'income') prev.income += amount
    else prev.expense += amount
    prev.balance = prev.income - prev.expense
    byMonth.set(month, prev)
  }

  const months = Array.from(byMonth.values()).sort((a, b) => (a.month > b.month ? -1 : a.month < b.month ? 1 : 0))
  const totalNetWorth = months.reduce((s, m) => s + Number(m.balance || 0), 0)
  return { months, totalNetWorth }
}

export function addRecord(recordInput) {
  const records = getRecords()
  const record = {
    id: newId(),
    type: recordInput.type === 'income' ? 'income' : 'expense',
    amount: Number(recordInput.amount),
    category: String(recordInput.category ?? '其他'),
    date: recordInput.date ? String(recordInput.date) : new Date().toISOString(),
    emotionScore: Math.min(5, Math.max(1, Math.round(Number(recordInput.emotionScore)))),
    note: String(recordInput.note ?? ''),
  }
  const next = [record, ...records]
  localStorage.setItem(RECORDS_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('emo-finance:records'))

  updatePixelPet((p) => {
    const base = applyPetDecay(p, Date.now())
    const hunger = clamp100(base.hunger + 5)
    const clean = clamp100(base.clean - 1)
    if (record.type === 'income') {
      const fatigue = Math.min(5, Math.max(1, Number(record.emotionScore || 3)))
      const deltaHappy = 6 + (6 - fatigue) * 2
      return {
        ...base,
        hunger,
        clean,
        happy: clamp100(base.happy + deltaHappy),
        lastRecordAtMs: Date.now(),
        lastRecordType: 'income',
        lastRecordImpulse: 0,
      }
    }
    const impulse = Math.min(5, Math.max(1, Number(record.emotionScore || 3)))
    const deltaHappy = 4 - impulse * 3
    return {
      ...base,
      hunger,
      clean,
      happy: clamp100(base.happy + deltaHappy),
      lastRecordAtMs: Date.now(),
      lastRecordType: 'expense',
      lastRecordImpulse: impulse,
    }
  })

  return record
}

export function deleteRecord(id) {
  const records = getRecords()
  const next = records.filter((r) => r.id !== id)
  localStorage.setItem(RECORDS_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('emo-finance:records'))
  return next.length !== records.length
}

export function clearRecords() {
  localStorage.removeItem(RECORDS_KEY)
  window.dispatchEvent(new Event('emo-finance:records'))
}

export function getAiSettings() {
  const raw = localStorage.getItem(AI_SETTINGS_KEY)
  const parsed = safeJsonParse(raw ?? 'null', null)
  if (!parsed || typeof parsed !== 'object') {
    return { apiKey: '', persona: '', baseUrl: '', model: '', modelPreset: '' }
  }
  return {
    apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    persona: typeof parsed.persona === 'string' ? parsed.persona : '',
    baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
    model: typeof parsed.model === 'string' ? parsed.model : '',
    modelPreset: typeof parsed.modelPreset === 'string' ? parsed.modelPreset : '',
  }
}

export function setAiSettings(settings) {
  const next = {
    apiKey: typeof settings.apiKey === 'string' ? settings.apiKey : '',
    persona: typeof settings.persona === 'string' ? settings.persona : '',
    baseUrl: typeof settings.baseUrl === 'string' ? settings.baseUrl : '',
    model: typeof settings.model === 'string' ? settings.model : '',
    modelPreset: typeof settings.modelPreset === 'string' ? settings.modelPreset : '',
  }
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('emo-finance:settings'))
  return next
}

export function subscribeRecords(callback) {
  const handler = () => callback()
  window.addEventListener('emo-finance:records', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('emo-finance:records', handler)
    window.removeEventListener('storage', handler)
  }
}

export function subscribeSettings(callback) {
  const handler = () => callback()
  window.addEventListener('emo-finance:settings', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('emo-finance:settings', handler)
    window.removeEventListener('storage', handler)
  }
}

export function getBudgetSettings() {
  const raw = localStorage.getItem(BUDGET_KEY)
  const parsed = safeJsonParse(raw ?? 'null', null)
  const monthKey = currentMonthKey()
  const v =
    parsed && typeof parsed === 'object' && parsed.byMonth && typeof parsed.byMonth === 'object'
      ? parsed.byMonth?.[monthKey]
      : parsed && typeof parsed === 'object'
        ? parsed.monthlyBudget
        : 0
  const monthlyBudget = Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0
  return { monthlyBudget }
}

export function setBudgetSettings(settings) {
  const monthKey = typeof settings?.monthKey === 'string' && settings.monthKey ? settings.monthKey : currentMonthKey()
  const monthlyBudget = Number.isFinite(Number(settings?.monthlyBudget))
    ? Math.max(0, Number(settings.monthlyBudget))
    : 0
  const raw = localStorage.getItem(BUDGET_KEY)
  const parsed = safeJsonParse(raw ?? 'null', null)
  const byMonth =
    parsed && typeof parsed === 'object' && parsed.byMonth && typeof parsed.byMonth === 'object'
      ? { ...parsed.byMonth }
      : {}
  byMonth[monthKey] = monthlyBudget
  const next = { byMonth }
  localStorage.setItem(BUDGET_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('emo-finance:budget'))
  return next
}

export function getBudgetSettingsForMonth(monthKeyInput) {
  const monthKey = typeof monthKeyInput === 'string' && monthKeyInput ? monthKeyInput : currentMonthKey()
  const raw = localStorage.getItem(BUDGET_KEY)
  const parsed = safeJsonParse(raw ?? 'null', null)
  const v =
    parsed && typeof parsed === 'object' && parsed.byMonth && typeof parsed.byMonth === 'object'
      ? parsed.byMonth?.[monthKey]
      : parsed && typeof parsed === 'object'
        ? parsed.monthlyBudget
        : 0
  const monthlyBudget = Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0
  return { monthlyBudget }
}

export function getAiMonthlyReviews() {
  const raw = localStorage.getItem(AI_MONTHLY_REVIEWS_KEY)
  const parsed = safeJsonParse(raw ?? 'null', null)
  if (!parsed || typeof parsed !== 'object') return {}
  return parsed
}

export function setAiMonthlyReview(monthKey, text) {
  const key = typeof monthKey === 'string' && monthKey ? monthKey : currentMonthKey()
  const raw = localStorage.getItem(AI_MONTHLY_REVIEWS_KEY)
  const parsed = safeJsonParse(raw ?? 'null', null)
  const next = parsed && typeof parsed === 'object' ? { ...parsed } : {}
  next[key] = { text: String(text || ''), updatedAt: new Date().toISOString() }
  localStorage.setItem(AI_MONTHLY_REVIEWS_KEY, JSON.stringify(next))
  return next[key]
}

export function subscribeBudget(callback) {
  const handler = () => callback()
  window.addEventListener('emo-finance:budget', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('emo-finance:budget', handler)
    window.removeEventListener('storage', handler)
  }
}
