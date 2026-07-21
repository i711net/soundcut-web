import { useEffect, useRef, useState } from 'react'

export type WaveformMark = { id: string; start: number; end: number; label: string; kind: 'split' | 'copy' | 'paste' | 'cut' | 'clip' }
type Props = { buffer: AudioBuffer; selection: [number, number]; currentTime: number; marks?: WaveformMark[]; onSelection: (value: [number, number]) => void; onSeek: (value: number) => void }

export default function Waveform({ buffer, selection, currentTime, marks = [], onSelection, onSeek }: Props) {
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
    const colors = { split: '#ffb45f', copy: '#78b7ff', paste: '#a88cff', cut: '#ff705a', clip: '#65dfad' }
    marks.forEach((mark, index) => {
      const startX = Math.max(0, Math.min(w, mark.start / duration * w)), endX = Math.max(startX, Math.min(w, mark.end / duration * w)), color = colors[mark.kind]
      if (endX - startX > 2) { ctx.globalAlpha = .13; ctx.fillStyle = color; ctx.fillRect(startX, 0, endX - startX, h); ctx.globalAlpha = 1 }
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(mark.kind === 'copy' ? [5, 4] : [])
      ctx.beginPath(); ctx.moveTo(startX, 0); ctx.lineTo(startX, h); if (endX - startX > 2) { ctx.moveTo(endX, 0); ctx.lineTo(endX, h) } ctx.stroke(); ctx.setLineDash([])
      const text = `${index + 1} · ${mark.label}`, textWidth = Math.min(110, Math.max(45, ctx.measureText(text).width + 10))
      ctx.fillStyle = color; ctx.fillRect(Math.min(w - textWidth, startX + 3), h - 20, textWidth, 16); ctx.fillStyle = '#071018'; ctx.font = '600 9px sans-serif'; ctx.fillText(text, Math.min(w - textWidth, startX + 3) + 5, h - 9)
    })
    ctx.strokeStyle = '#ff705a'; ctx.lineWidth = 2; const playX = currentTime / duration * w
    ctx.beginPath(); ctx.moveTo(playX, 0); ctx.lineTo(playX, h); ctx.stroke()
    ctx.fillStyle = '#dff'; [a, b].forEach(x => { ctx.fillRect(x - 2, 0, 4, h); ctx.beginPath(); ctx.arc(x, h / 2, 7, 0, Math.PI * 2); ctx.fill() })
  }, [buffer, selection, currentTime, duration, marks])

  const timeAt = (event: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect()
    return Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration))
  }
  const selectedDuration = Math.max(0, selection[1] - selection[0])
  return <div className={`waveform-shell ${dragStart !== null ? 'drag-selecting' : ''}`}>
    <canvas ref={canvas} className="waveform" aria-label="按住鼠标左键并拖动，选择需要剪切的音频范围"
      onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); const time = timeAt(e); setDragStart(time); onSelection([time, time]); canvas.current?.setPointerCapture(e.pointerId) }}
      onPointerMove={e => { if (dragStart === null) return; e.preventDefault(); const time = timeAt(e); onSelection([Math.min(dragStart, time), Math.max(dragStart, time)]) }}
      onPointerUp={e => { const time = timeAt(e); if (dragStart !== null && Math.abs(time - dragStart) < .05) onSeek(time); if (canvas.current?.hasPointerCapture(e.pointerId)) canvas.current.releasePointerCapture(e.pointerId); setDragStart(null) }}
      onPointerCancel={() => setDragStart(null)}/>
    {dragStart !== null && <div className="drag-selection-tip"><strong>正在选择剪切区域</strong><span>{selectedDuration.toFixed(3)} 秒</span></div>}
    {dragStart === null && selectedDuration >= .01 && selectedDuration < duration - .01 && <div className="selection-ready-tip">已选择 {selectedDuration.toFixed(3)} 秒 · 点击上方“剪切”</div>}
  </div>
}
