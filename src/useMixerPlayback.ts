import { useCallback, useEffect, useRef, useState } from 'react'
import { audibleTracks, durationOfTracks, type MixerTrack } from './mixer'

export function useMixerPlayback(tracks: MixerTrack[], speed: number, onTime: (time: number) => void) {
  const context = useRef<AudioContext | null>(null)
  const nodes = useRef<AudioBufferSourceNode[]>([])
  const gains = useRef<Map<string, GainNode>>(new Map())
  const frame = useRef(0), startedAt = useRef(0), offset = useRef(0)
  const [playing, setPlaying] = useState(false)
  const duration = durationOfTracks(tracks)

  const stop = useCallback(() => {
    nodes.current.forEach(node => { try { node.stop() } catch { /* ended */ } })
    nodes.current = []; gains.current.clear(); cancelAnimationFrame(frame.current); setPlaying(false)
  }, [])

  const playFrom = useCallback(async (time: number) => {
    stop()
    const audioContext = context.current ?? new AudioContext(); context.current = audioContext; await audioContext.resume()
    const playable = audibleTracks(tracks)
    if (!playable.length) return
    offset.current = Math.max(0, Math.min(time, duration)); startedAt.current = audioContext.currentTime
    for (const track of playable) {
      if (!track.buffer || offset.current >= track.buffer.duration) continue
      const node = audioContext.createBufferSource(), gain = audioContext.createGain()
      node.buffer = track.buffer; node.playbackRate.value = speed; gain.gain.value = track.volume
      node.connect(gain).connect(audioContext.destination); node.start(0, offset.current)
      nodes.current.push(node); gains.current.set(track.id, gain)
    }
    setPlaying(true)
    const tick = () => {
      const timeNow = Math.min(duration, offset.current + (audioContext.currentTime - startedAt.current) * speed)
      onTime(timeNow)
      if (timeNow < duration && nodes.current.length) frame.current = requestAnimationFrame(tick); else stop()
    }
    frame.current = requestAnimationFrame(tick)
  }, [duration, onTime, speed, stop, tracks])

  useEffect(() => {
    const audible = new Set(audibleTracks(tracks).map(track => track.id))
    for (const track of tracks) {
      const gain = gains.current.get(track.id)
      if (gain) gain.gain.setTargetAtTime(audible.has(track.id) ? track.volume : 0, gain.context.currentTime, .01)
    }
  }, [tracks])

  useEffect(() => () => { stop(); void context.current?.close() }, [stop])
  return { playing, duration, playFrom, stop }
}
