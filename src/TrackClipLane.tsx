import { useEffect, useRef, useState } from 'react'
import type { AudioClip, MixerTrack } from './mixer'

type Props = { track: MixerTrack; timelineDuration: number; currentTime: number; selectedClipId: string; onSelect: (clip: AudioClip) => void; onMove: (clipId: string, start: number) => void; onTrim: (clipId: string, patch: Partial<AudioClip>) => void; onSeek: (time: number) => void }

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

export default function TrackClipLane({ track, timelineDuration, currentTime, selectedClipId, onSelect, onMove, onTrim, onSeek }: Props) {
  const lane = useRef<HTMLDivElement>(null), drag = useRef<{ id: string; pointerX: number; start: number; moved: boolean } | null>(null)
  const trim = useRef<{ id: string; side: 'left' | 'right'; pointerX: number; start: number; offset: number; duration: number } | null>(null)
  const [draft, setDraft] = useState<Record<string, number>>({})
  const rate = track.playbackRate * track.clipPlaybackRate
  const timeAt = (clientX: number) => { const rect = lane.current!.getBoundingClientRect(); return Math.max(0, Math.min(timelineDuration, (clientX - rect.left) / rect.width * timelineDuration)) }
  return <div className="clip-lane" ref={lane} onDoubleClick={event => onSeek(timeAt(event.clientX))}>
    {track.clips.map((clip, index) => {
      const start = draft[clip.id] ?? clip.start, length = clip.duration / (rate * clip.playbackRate), selected = selectedClipId === clip.id
      return <div key={clip.id} className={`timeline-clip ${selected ? 'selected' : ''}`} style={{ left: `${start / timelineDuration * 100}%`, width: `${Math.max(.35, length / timelineDuration * 100)}%` }}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); onSelect(clip); drag.current = { id: clip.id, pointerX: event.clientX, start: clip.start, moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={event => { const state = drag.current; if (!state || state.id !== clip.id) return; const rect = lane.current!.getBoundingClientRect(), delta = (event.clientX - state.pointerX) / rect.width * timelineDuration; if (Math.abs(event.clientX - state.pointerX) > 2) state.moved = true; const next = Math.max(0, Math.min(timelineDuration - length, state.start + delta)); setDraft(value => ({ ...value, [clip.id]: next })) }}
        onPointerUp={event => { const state = drag.current; if (!state || state.id !== clip.id) return; const next = draft[clip.id] ?? clip.start; if (state.moved) onMove(clip.id, next); else onSeek(timeAt(event.clientX)); setDraft(value => { const copy = { ...value }; delete copy[clip.id]; return copy }); drag.current = null }}>
        <div className="clip-title"><b>{index + 1}</b><span>{clip.name}</span><time>{start.toFixed(2)}s</time></div><ClipWave clip={clip}/>
        {(['left', 'right'] as const).map(side => <i key={side} className={`clip-${side}-edge`} onPointerDown={event => { event.stopPropagation(); onSelect(clip); trim.current = { id: clip.id, side, pointerX: event.clientX, start: clip.start, offset: clip.offset, duration: clip.duration }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { const state = trim.current; if (!state || state.id !== clip.id || state.side !== side) return; const rect = lane.current!.getBoundingClientRect(), timelineDelta = (event.clientX - state.pointerX) / rect.width * timelineDuration, sourceDelta = timelineDelta * rate * clip.playbackRate; if (side === 'left') { const applied = Math.max(-state.offset, Math.min(state.duration - .02, sourceDelta)); onTrim(clip.id, { start: state.start + applied / (rate * clip.playbackRate), offset: state.offset + applied, duration: state.duration - applied }) } else onTrim(clip.id, { duration: Math.max(.02, Math.min(clip.buffer.duration - state.offset, state.duration + sourceDelta)) }) }} onPointerUp={() => { trim.current = null }}/>) }
      </div>
    })}
    <div className="lane-playhead" style={{ left: `${currentTime / timelineDuration * 100}%` }}/>
  </div>
}
