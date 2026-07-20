import { useEffect, useRef, useState } from 'react'

type Props = { buffer: AudioBuffer; selection: [number, number]; currentTime: number; onSelection: (value: [number, number]) => void; onSeek: (value: number) => void }

export default function Waveform({ buffer, selection, currentTime, onSelection, onSeek }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const duration = buffer.duration

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const rect = el.getBoundingClientRect(), ratio = window.devicePixelRatio || 1
    el.width = rect.width * ratio; el.height = rect.height * ratio
    const ctx = el.getContext('2d')!; ctx.scale(ratio, ratio)
    const w = rect.width, h = rect.height, data = buffer.getChannelData(0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#0d1a25'; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(132,161,181,.14)'; ctx.lineWidth = 1
    for (let i = 0; i <= 10; i++) { const x = (i / 10) * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    const a = selection[0] / duration * w, b = selection[1] / duration * w
    ctx.fillStyle = 'rgba(54, 212, 207, .13)'; ctx.fillRect(a, 0, b - a, h)
    const step = Math.max(1, Math.floor(data.length / w)); const amp = h * .42
    ctx.strokeStyle = '#42d3cf'; ctx.lineWidth = 1; ctx.beginPath()
    for (let x = 0; x < w; x++) {
      let min = 1, max = -1
      for (let j = 0; j < step; j++) { const v = data[(x * step) + j] || 0; min = Math.min(min, v); max = Math.max(max, v) }
      ctx.moveTo(x, h / 2 + min * amp); ctx.lineTo(x, h / 2 + max * amp)
    }
    ctx.stroke()
    ctx.strokeStyle = '#ff705a'; ctx.lineWidth = 2; const playX = currentTime / duration * w
    ctx.beginPath(); ctx.moveTo(playX, 0); ctx.lineTo(playX, h); ctx.stroke()
    ctx.fillStyle = '#dff'; [a, b].forEach(x => { ctx.fillRect(x - 2, 0, 4, h); ctx.beginPath(); ctx.arc(x, h / 2, 7, 0, Math.PI * 2); ctx.fill() })
  }, [buffer, selection, currentTime, duration])

  const timeAt = (event: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect()
    return Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration))
  }
  return <canvas ref={canvas} className="waveform" aria-label="音频波形，可拖动选择剪辑范围"
    onPointerDown={e => { const time = timeAt(e); setDragStart(time); onSelection([time, time]); canvas.current?.setPointerCapture(e.pointerId) }}
    onPointerMove={e => { if (dragStart === null) return; const time = timeAt(e); onSelection([Math.min(dragStart, time), Math.max(dragStart, time)]) }}
    onPointerUp={e => { const time = timeAt(e); if (dragStart !== null && Math.abs(time - dragStart) < .05) onSeek(time); setDragStart(null) }} />
}
