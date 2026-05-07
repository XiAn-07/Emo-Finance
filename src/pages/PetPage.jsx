import { useEffect, useMemo, useRef, useState } from 'react'
import { Bath, Drum, Home, Server, Utensils } from 'lucide-react'
import { getPixelPet, petFeed, petPlay, petWash, subscribePet } from '../lib/storage'

function clamp100(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.min(100, Math.max(0, x))
}

function barColor(kind, v) {
  const x = clamp100(v)
  if (kind === 'hunger') return x < 30 ? 'bg-orange-600' : 'bg-orange-400'
  if (kind === 'happy') return x < 30 ? 'bg-pink-600' : 'bg-pink-400'
  return x < 30 ? 'bg-sky-600' : 'bg-sky-400'
}

function newFxId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export default function PetPage() {
  const [pet, setPet] = useState(() => getPixelPet())
  const [room, setRoom] = useState(() => (localStorage.getItem('pet_room') === 'cyber' ? 'cyber' : 'cozy'))
  const [bubble, setBubble] = useState({ open: false, text: '' })
  const lastEventRef = useRef(pet.lastEventAtMs || 0)
  const bubbleTimerRef = useRef(null)
  const fxTimerRef = useRef(null)
  const [fx, setFx] = useState([])

  useEffect(() => {
    const refresh = () => setPet(getPixelPet())
    refresh()
    return subscribePet(refresh)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setPet(getPixelPet()), 1200)
    return () => window.clearInterval(id)
  }, [])

  function showBubble(text) {
    const t = String(text || '').trim()
    if (!t) return
    setBubble({ open: true, text: t })
    if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current)
    bubbleTimerRef.current = window.setTimeout(() => setBubble({ open: false, text: '' }), 3400)
  }

  function pickBubbleText(nextPet) {
    if (nextPet.lastRecordType === 'expense' && Number(nextPet.lastRecordImpulse || 0) >= 4) {
      return '哎呀，心痛的感觉...'
    }
    if (nextPet.hunger < 30) return '呜呜，想吃好吃的...'
    if (nextPet.happy > 75) return '主子理财有方，我太爽了！'
    if (nextPet.clean < 30) return '我想洗洗再继续冒险！'
    return '今天也要稳稳记账哦。'
  }

  useEffect(() => {
    const nextEvent = Number(pet.lastEventAtMs || 0)
    if (nextEvent && nextEvent !== lastEventRef.current) {
      lastEventRef.current = nextEvent
      showBubble(pickBubbleText(pet))
    }
  }, [pet])

  useEffect(() => {
    const id = window.setInterval(() => showBubble(pickBubbleText(getPixelPet())), 10000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    return () => {
      if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current)
      if (fxTimerRef.current) window.clearTimeout(fxTimerRef.current)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('pet_room', room)
  }, [room])

  const moodText = useMemo(() => {
    if (pet.hunger < 25) return '我好饿…'
    if (pet.clean < 30) return '我有点脏…'
    if (pet.happy < 35) return '我有点低落…'
    if (pet.happy > 75) return '今天超开心！'
    return '一起稳稳变富！'
  }, [pet.clean, pet.happy, pet.hunger])

  const videoSrc = room === 'cyber' ? '/VID_20260430_150552炫彩橘猫.mp4' : '/VID_20260430_150342温馨橘猫.mp4'

  const healthScore = useMemo(() => {
    const hunger = clamp100(pet.hunger)
    const happy = clamp100(pet.happy)
    const clean = clamp100(pet.clean)
    return (hunger + happy + clean) / 3
  }, [pet.clean, pet.happy, pet.hunger])

  const videoFilter = useMemo(() => {
    if (healthScore < 22 || pet.hunger < 18) return 'grayscale(0.85) sepia(0.32) saturate(0.72) brightness(0.92)'
    if (healthScore < 40 || pet.hunger < 30) return 'grayscale(0.75) sepia(0.26) saturate(0.82) brightness(0.96)'
    return 'brightness(1.1) saturate(1.1)'
  }, [healthScore, pet.hunger])

  const isExtremeBad = healthScore < 22 || pet.hunger < 18

  function spawnFx(kind) {
    const baseX = 40 + Math.random() * 20
    const baseY = 62 + Math.random() * 10
    const count = kind === 'feed' ? 7 : kind === 'play' ? 6 : 6
    const next = Array.from({ length: count }).map(() => ({
      id: newFxId(),
      kind,
      x: baseX + (Math.random() - 0.5) * 18,
      y: baseY + (Math.random() - 0.5) * 10,
      delayMs: Math.floor(Math.random() * 140),
    }))
    setFx((prev) => [...prev, ...next])
    if (fxTimerRef.current) window.clearTimeout(fxTimerRef.current)
    fxTimerRef.current = window.setTimeout(() => setFx([]), 1100)
  }

  function onFeed() {
    petFeed()
    spawnFx('feed')
    showBubble('开饭啦！')
  }

  function onPlay() {
    petPlay()
    spawnFx('play')
    showBubble('今天也要开心！')
  }

  function onWash() {
    petWash()
    spawnFx('wash')
    showBubble('清爽上线。')
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div
          className={`habitat ${room === 'cyber' ? 'habitat-cyber' : 'habitat-cozy'} relative aspect-square min-h-[360px] overflow-hidden rounded-3xl border`}
        >
          <div className={isExtremeBad ? 'pet-video-wrap pet-shake' : 'pet-video-wrap'}>
            <video
              key={videoSrc}
              className="h-full w-full object-cover"
              src={videoSrc}
              autoPlay
              loop
              muted
              playsInline
              style={{ filter: videoFilter }}
            />
          </div>

          {bubble.open ? (
            <div className="pointer-events-none absolute left-1/2 top-[58%] z-10 -translate-x-1/2">
              <div className="font-pixel rounded-2xl border border-[#3B2A1A]/35 bg-white/75 px-5 py-3 text-[12px] leading-6 text-[#3B2A1A] backdrop-blur-sm dark:border-white/20 dark:bg-[#0F172A]/60 dark:text-slate-200">
                {bubble.text}
              </div>
            </div>
          ) : null}

          {fx.length ? (
            <div className="pointer-events-none absolute inset-0 z-10">
              {fx.map((x) => (
                <span
                  key={x.id}
                  className={
                    x.kind === 'feed'
                      ? 'pet-fx pet-fx-heart font-pixel'
                      : x.kind === 'play'
                        ? 'pet-fx pet-fx-spark font-pixel'
                        : 'pet-fx pet-fx-bubble font-pixel'
                  }
                  style={{ left: `${x.x}%`, top: `${x.y}%`, animationDelay: `${x.delayMs}ms` }}
                >
                  {x.kind === 'feed' ? '❤' : x.kind === 'play' ? '✦' : '❍'}
                </span>
              ))}
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
            <div className="bg-gradient-to-t from-black/55 to-transparent px-5 pb-5 pt-10">
              <div className="text-base font-semibold text-white drop-shadow">{moodText}</div>
              <div className="mt-2 text-sm text-white/85 drop-shadow">
                记账会影响状态：收入更开心；冲动支出会掉心情；离开页面也会随时间慢慢衰减。
              </div>
            </div>
          </div>
        </div>

        <div className="app-card rounded-3xl border p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-slate-900 dark:text-white">Pet Room</div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">选择氛围，保持状态在线</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRoom('cozy')}
                className={
                  room === 'cozy'
                    ? 'flex items-center gap-2 rounded-2xl accent-bg px-3 py-2 text-sm font-semibold text-white shadow-sm'
                    : 'flex items-center gap-2 rounded-2xl border border-[#5C4033]/30 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white/80 dark:border-white/20 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
                }
              >
                <Home size={16} />
                温馨
              </button>
              <button
                type="button"
                onClick={() => setRoom('cyber')}
                className={
                  room === 'cyber'
                    ? 'flex items-center gap-2 rounded-2xl accent-bg px-3 py-2 text-sm font-semibold text-white shadow-sm'
                    : 'flex items-center gap-2 rounded-2xl border border-[#5C4033]/30 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white/80 dark:border-white/20 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
                }
              >
                <Server size={16} />
                赛博
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="grid gap-3">
              <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
                <div className="font-semibold text-slate-900 dark:text-white">饱食度</div>
                <div className="font-semibold">{Math.round(pet.hunger)}</div>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className={`h-3 rounded-full ${barColor('hunger', pet.hunger)} transition-[width] duration-500`}
                  style={{ width: `${Math.min(100, Math.max(0, pet.hunger))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
                <div className="font-semibold text-slate-900 dark:text-white">快乐度</div>
                <div className="font-semibold">{Math.round(pet.happy)}</div>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className={`h-3 rounded-full ${barColor('happy', pet.happy)} transition-[width] duration-500`}
                  style={{ width: `${Math.min(100, Math.max(0, pet.happy))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
                <div className="font-semibold text-slate-900 dark:text-white">清洁度</div>
                <div className="font-semibold">{Math.round(pet.clean)}</div>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className={`h-3 rounded-full ${barColor('clean', pet.clean)} transition-[width] duration-500`}
                  style={{ width: `${Math.min(100, Math.max(0, pet.clean))}%` }}
                />
              </div>

              <div className="pt-1 text-center text-xs text-slate-500 dark:text-slate-400">
                小提示：高质量收入（劳累低）与理性消费，会让它更稳定。
              </div>
            </div>

            <div className="grid gap-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">互动</div>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-2xl accent-bg px-4 py-3 text-sm font-semibold text-white shadow-sm active:translate-y-[2px]"
                onClick={onFeed}
              >
                <Utensils size={16} />
                喂食
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-2xl accent-bg px-4 py-3 text-sm font-semibold text-white shadow-sm active:translate-y-[2px]"
                onClick={onPlay}
              >
                <Drum size={16} />
                玩耍
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#5C4033]/30 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm active:translate-y-[2px] dark:border-white/20 dark:bg-white/5 dark:text-slate-100"
                onClick={onWash}
              >
                <Bath size={16} />
                洗澡
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
