import { useEffect, useMemo, useState } from 'react'
import TopNav from './components/TopNav'
import AiTherapistPage from './pages/AiTherapistPage'
import DashboardPage from './pages/DashboardPage'
import PetPage from './pages/PetPage'
import RecordPage from './pages/RecordPage'
import SettingsPage from './pages/SettingsPage'
import { getRecords, subscribeRecords } from './lib/storage'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function monthKeyFromDate(d) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`
}

function monthOptions(count = 6) {
  const now = new Date()
  const list = []
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = monthKeyFromDate(d)
    const label = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
    list.push({ key, label })
  }
  return list
}

export default function App() {
  const [page, setPage] = useState('record')
  const [monthKey, setMonthKey] = useState(() => monthKeyFromDate(new Date()))
  const [months, setMonths] = useState(() => monthOptions(6))
  const [theme, setTheme] = useState(() => {
    const t = localStorage.getItem('theme')
    return t === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    const build = () => {
      const records = getRecords()
      const keys = new Set(records.map((r) => monthKeyFromDate(r.date)))
      keys.add(monthKeyFromDate(new Date()))
      const base = monthOptions(12).map((m) => m.key)
      for (const k of base) keys.add(k)
      keys.add(monthKey)
      const sorted = Array.from(keys).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
      setMonths(sorted.map((k) => ({ key: k, label: k })))
    }
    build()
    return subscribeRecords(build)
  }, [monthKey])

  useEffect(() => {
    const isDark = theme === 'dark'
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
    document.documentElement.style.setProperty('--theme-tick', String(Date.now()))
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [theme])

  const content = useMemo(() => {
    if (page === 'dashboard') return <DashboardPage monthKey={monthKey} theme={theme} />
    if (page === 'pet') return <PetPage />
    if (page === 'ai') return <AiTherapistPage />
    if (page === 'settings') return <SettingsPage monthKey={monthKey} />
    return <RecordPage monthKey={monthKey} onSaved={() => setPage('dashboard')} />
  }, [page, monthKey, theme])

  return (
    <div className="min-h-full">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#A855F7]/22 blur-3xl dark:bg-[#A855F7]/18" />
        <div className="absolute -right-24 top-24 h-72 w-72 rounded-full bg-[#2DD4BF]/16 blur-3xl dark:bg-[#2DD4BF]/12" />
        <div className="absolute left-1/3 top-[60%] h-72 w-72 rounded-full bg-[#A855F7]/10 blur-3xl dark:bg-[#A855F7]/10" />
      </div>

      <TopNav
        page={page}
        onChange={setPage}
        monthKey={monthKey}
        months={months}
        onMonthChange={setMonthKey}
        theme={theme}
        onThemeChange={setTheme}
      />
      {content}
      <div className="pb-10" />
    </div>
  )
}
