import { useEffect, useRef, useState } from 'react'
import type { AudioClip, MixerTrack } from './mixer'

type Props = { track: MixerTrack; timelineDuration: number; tool: 'move' | 'select'; selection: [number, number]; selectedClipId: string; onSelect: (clip: AudioClip) => void; onSelection: (range: [number, number]) => void; onMove: (clipId: string, start: number, targetTrackId: string) => void; onTrim: (clipId: string, patch: Partial<AudioClip>) => void; onSeek: (time: number) => void }

function ClipWave({ clip }: { clip: AudioClip }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current; if (!element) return
    const rect = element.getBoundingClientRect(), ratio = window.devicePixelRatio || 1
    element.width = Math.max(1, rect.width * ratio); element.height = Math.max(1, rect.height * ratio)
    const context = element.getContext('2d'); if (!context) return
    context.scale(ratio, ratio); context.clearRect(0, 0, rect.width, rect.height)
    const data = clip.buffer.getChannelData(0), startFrame = Math.floor(clip.offset * clip.buffer.sampleRate), frames = Math.floor(clip.duration * clip.buffer.sampleRate), step = Math.max(1, Math.floor(frames / Math.max(1, rect.width))), amplitude = rect.height * .37
    context.strokeStyle = '#57ddd7'; context.lineWidth = 1; context.beginPath()
    for (let x = 0; x < rect.width; x++) { let min = 1, max = -1; const frame = startFrame + x * step; for (let j = 0; j < step; j++) { const value = data[frame + j] || 0; min = Math.min(min, value); max = Math.max(max, value) } context.moveTo(x, rect.height / 2 + min * amplitude); context.lineTo(x, rect.height / 2 + max * amplitude) }
    context.stroke()
  }, [clip])
  return <canvas ref={canvas}/>
}

export default function TrackClipLane({ track, timelineDuration, tool, selection, selectedClipId, onSelect, onSelection, onMove, onTrim, onSeek }: Props) {
  const lane = useRef<HTMLDivElement>(null), drag = useRef<{ id: string; pointerX: number; start: number; moved: boolean } | null>(null)
  const trim = useRef<{ id: string; side: 'left' | 'right'; pointerX: number; start: number; offset: number; duration: number } | null>(null)
  const fade = useRef<{ id: string; side: 'in' | 'out'; pointerX: number; value: number } | null>(null)
  const automation = useRef<{ clipId: string; pointId: string } | null>(null)
  const selecting = useRef<{ start: number; clipStart: number; clipEnd: number } | null>(null)
  const [draft, setDraft] = useState<Record<string, number>>({})
  const rate = track.playbackRate * track.clipPlaybackRate
  const timeAt = (clientX: number) => { const rect = lane.current!.getBoundingClientRect(); return Math.max(0, Math.min(timelineDuration, (clientX - rect.left) / rect.width * timelineDuration)) }
  const beginSelection = (clientX: number) => {
    const at = timeAt(clientX), clip = track.clips.find(item => { const length = item.duration / (rate * item.playbackRate); return at >= item.start && at <= item.start + length })
    if (!clip) return
    const clipEnd = clip.start + clip.duration / (rate * clip.playbackRate)
    onSelect(clip); selecting.current = { start: at, clipStart: clip.start, clipEnd }; onSelection([at, at])
  }
  return <div className={`clip-lane ${tool === 'select' ? 'select-mode' : 'move-mode'}`} data-track-id={track.id} ref={lane} onDoubleClick={event => tool === 'move' && onSeek(timeAt(event.clientX))}
    onPointerDown={event => { if (tool !== 'select' || event.button !== 0) return; event.preventDefault(); beginSelection(event.clientX); if (selecting.current) event.currentTarget.setPointerCapture(event.pointerId) }}
    onPointerMove={event => { const state = selecting.current; if (tool !== 'select' || !state) return; const at = Math.max(state.clipStart, Math.min(state.clipEnd, timeAt(event.clientX))); onSelection([Math.min(state.start, at), Math.max(state.start, at)]) }}
    onPointerUp={() => { selecting.current = null }}>
    {track.clips.map((clip, index) => {
      const start = draft[clip.id] ?? clip.start, length = clip.duration / (rate * clip.playbackRate), selected = selectedClipId === clip.id
      return <div key={clip.id} data-clip-id={clip.id} data-clip-track={track.id} className={`timeline-clip ${selected ? 'selected' : ''}`} style={{ left: `${start / timelineDuration * 100}%`, width: `${Math.max(.35, length / timelineDuration * 100)}%` }}
        onPointerDown={event => { if (tool === 'select' || event.button !== 0) return; event.preventDefault(); onSelect(clip); drag.current = { id: clip.id, pointerX: event.clientX, start: clip.start, moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={event => { const state = drag.current; if (!state || state.id !== clip.id) return; const rect = lane.current!.getBoundingClientRect(), delta = (event.clientX - state.pointerX) / rect.width * timelineDuration; if (Math.abs(event.clientX - state.pointerX) > 2) state.moved = true; const next = Math.max(0, Math.min(timelineDuration - length, state.start + delta)); setDraft(value => ({ ...value, [clip.id]: next })) }}
        onPointerUp={event => { const state = drag.current; if (!state || state.id !== clip.id) return; const next = draft[clip.id] ?? clip.start, target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-track-id]')?.dataset.trackId || track.id; if (state.moved) onMove(clip.id, next, target); else onSeek(timeAt(event.clientX)); setDraft(value => { const copy = { ...value }; delete copy[clip.id]; return copy }); drag.current = null }}>
        <div className="clip-title"><b>{index + 1}</b><span>{clip.name}</span><time>{start.toFixed(2)}s</time></div><ClipWave clip={clip}/>
        {clip.fadeIn > 0 && <div className="clip-fade-curve fade-in" style={{ width: `${Math.min(100, clip.fadeIn / length * 100)}%` }}><span>{clip.fadeIn.toFixed(2)}s</span></div>}
        {clip.fadeOut > 0 && <div className="clip-fade-curve fade-out" style={{ width: `${Math.min(100, clip.fadeOut / length * 100)}%` }}><span>{clip.fadeOut.toFixed(2)}s</span></div>}
        {selected && <svg className="volume-envelope" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={[{ time: 0, value: 1 }, ...(clip.volumeEnvelope || []), { time: length, value: clip.volumeEnvelope?.at(-1)?.value ?? 1 }].map(point => `${point.time / length * 100},${100 - Math.min(2, Math.max(0, point.value)) * 50}`).join(' ')}/></svg>}
        {selected && (clip.volumeEnvelope || []).map(point => <i key={point.id} className="volume-keyframe" title={`${point.time.toFixed(2)}秒 · ${Math.round(point.value * 100)}%`} style={{ left: `${point.time / length * 100}%`, top: `${20 + (100 - Math.min(2, Math.max(0, point.value)) * 50) * .72}%` }} onPointerDown={event => { event.stopPropagation(); automation.current = { clipId: clip.id, pointId: point.id }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { const state = automation.current; if (!state || state.clipId !== clip.id || state.pointId !== point.id) return; event.stopPropagation(); const rect = event.currentTarget.parentElement!.getBoundingClientRect(), time = Math.max(0, Math.min(length, (event.clientX - rect.left) / rect.width * length)), value = Math.max(0, Math.min(2, 2 - (event.clientY - rect.top - 20) / Math.max(1, rect.height - 20) * 2)); onTrim(clip.id, { volumeEnvelope: (clip.volumeEnvelope || []).map(item => item.id === point.id ? { ...item, time, value } : item).sort((a, b) => a.time - b.time) }) }} onPointerUp={event => { event.stopPropagation(); automation.current = null }}/>) }
        {tool === 'move' && (['in', 'out'] as const).map(side => <i key={side} title={side === 'in' ? '拖动调整淡入' : '拖动调整淡出'} className={`clip-fade-handle fade-${side}`} onPointerDown={event => { event.stopPropagation(); onSelect(clip); fade.current = { id: clip.id, side, pointerX: event.clientX, value: side === 'in' ? clip.fadeIn : clip.fadeOut }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { const state = fade.current; if (!state || state.id !== clip.id || state.side !== side) return; event.stopPropagation(); const rect = lane.current!.getBoundingClientRect(), delta = (event.clientX - state.pointerX) / rect.width * timelineDuration, maximum = length; onTrim(clip.id, side === 'in' ? { fadeIn: Math.max(0, Math.min(maximum, state.value + delta)) } : { fadeOut: Math.max(0, Math.min(maximum, state.value - delta)) }) }} onPointerUp={event => { event.stopPropagation(); fade.current = null }}/>) }
        {tool === 'move' && (['left', 'right'] as const).map(side => <i key={side} className={`clip-${side}-edge`} onPointerDown={event => { event.stopPropagation(); onSelect(clip); trim.current = { id: clip.id, side, pointerX: event.clientX, start: clip.start, offset: clip.offset, duration: clip.duration }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { const state = trim.current; if (!state || state.id !== clip.id || state.side !== side) return; const rect = lane.current!.getBoundingClientRect(), timelineDelta = (event.clientX - state.pointerX) / rect.width * timelineDuration, sourceDelta = timelineDelta * rate * clip.playbackRate; if (side === 'left') { const applied = Math.max(-state.offset, Math.min(state.duration - .02, sourceDelta)); onTrim(clip.id, { start: state.start + applied / (rate * clip.playbackRate), offset: state.offset + applied, duration: state.duration - applied }) } else onTrim(clip.id, { duration: Math.max(.02, Math.min(clip.buffer.duration - state.offset, state.duration + sourceDelta)) }) }} onPointerUp={() => { trim.current = null }}/>) }
      </div>
    })}
    {tool === 'select' && selectedClipId && selection[1] > selection[0] && <div className="lane-selection" style={{ left: `${selection[0] / timelineDuration * 100}%`, width: `${(selection[1] - selection[0]) / timelineDuration * 100}%` }}><span>{(selection[1] - selection[0]).toFixed(3)} 秒</span></div>}
  </div>
}
