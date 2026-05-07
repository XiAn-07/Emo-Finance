import { useEffect, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import Toast from '../components/Toast'
import { getBudgetSettingsForMonth, getRecords, setBudgetSettings, setRecords } from '../lib/storage'

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function SettingsPage({ monthKey }) {
  const inputRef = useRef(null)
  const [toast, setToast] = useState({ open: false, type: 'success', message: '' })
  const [monthlyBudget, setMonthlyBudget] = useState(() => getBudgetSettingsForMonth(monthKey).monthlyBudget)

  useEffect(() => {
    setMonthlyBudget(getBudgetSettingsForMonth(monthKey).monthlyBudget)
  }, [monthKey])

  function showToast(next) {
    setToast({ open: true, ...next })
  }

  function closeToast() {
    setToast((t) => ({ ...t, open: false }))
  }

  function onExport() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      records: getRecords(),
    }
    downloadJson('emo_finance_backup.json', payload)
    showToast({ type: 'success', message: '已导出备份文件：emo_finance_backup.json' })
  }

  async function onImportFile(file) {
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const records = Array.isArray(json) ? json : json?.records
      if (!Array.isArray(records)) {
        throw new Error('备份文件格式不正确：未找到 records 数组')
      }
      setRecords(records)
      showToast({ type: 'success', message: `导入成功：恢复 ${records.length} 条记录` })
    } catch (e) {
      showToast({ type: 'error', message: e?.message || '导入失败，请检查文件格式' })
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="app-card rounded-3xl border p-6 shadow-soft">
        <div className="text-lg font-semibold text-slate-900 dark:text-white">设置</div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">数据备份与恢复，强化你对数据的自主权。</div>

        <div className="app-card mt-6 rounded-3xl border p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">预算设置（预测基础）</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            设置预算后，看板会开启“月末支出预测与预警”，并生成 AI 锦囊。
          </div>
          <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">预算月份：{monthKey}</div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              step="1"
              value={monthlyBudget || ''}
              onChange={(e) => {
                const v = Number(e.target.value)
                setMonthlyBudget(Number.isFinite(v) ? v : 0)
              }}
              placeholder="例如：3000"
              className="w-full flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-lg font-semibold text-slate-900 outline-none transition focus:border-slate-300 focus:shadow-sm sm:w-auto sm:min-w-[240px] dark:border-white/20 dark:bg-white/10 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => {
                setBudgetSettings({ monthKey, monthlyBudget })
                showToast({ type: 'success', message: '预算已保存。' })
              }}
              className="w-full rounded-2xl accent-bg px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-95 sm:w-auto"
            >
              保存预算
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onExport}
            className="flex items-center justify-center gap-2 rounded-2xl accent-bg px-5 py-4 text-sm font-semibold text-white shadow-soft transition hover:brightness-95"
          >
            <Download size={18} />
            导出备份
          </button>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/20 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
          >
            <Upload size={18} />
            导入备份
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onImportFile(file)
          }}
        />

        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
          说明：备份只包含 records（账单数据）。导入会覆盖当前 records。
        </div>
      </div>

      <Toast open={toast.open} type={toast.type} message={toast.message} onClose={closeToast} />
    </div>
  )
}
