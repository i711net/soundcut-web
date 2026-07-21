import { useCallback, useEffect, useRef, useState } from 'react'
import { audibleTracks, durationOfTracks, trackRate, type MixerTrack } from './mixer'
import { connectVoiceEffects } from './voice-effects'

export function useMixerPlayback(tracks: MixerTrack[], masterRate: number, masterVolume: number, onTime: (time: number) => void) {
  const context = useRef<AudioContext | null>(null)
  const nodes = useRef<Map<string, AudioBufferSourceNode>>(new Map())
  const gains = useRef<Map<string, GainNode>>(new Map())
  const frame = useRef(0), startedAt = useRef(0), offset = useRef(0)
  const effectSignature = useRef('')
  const [playing, setPlaying] = useState(false)
  const duration = durationOfTracks(tracks, masterRate)

  const stop = useCallback(() => {
    nodes.current.forEach(node => { try { node.stop() } catch { /* ended */ } })
    nodes.current.clear(); gains.current.clear(); cancelAnimationFrame(frame.current); setPlaying(false)
  }, [])

  const playFrom = useCallback(async (time: number) => {
    stop()
    const audioContext = context.current ?? new AudioContext(); context.current = audioContext; await audioContext.resume()
    const playable = audibleTracks(tracks)
    if (!playable.length) return
    offset.current = Math.max(0, Math.min(time, duration)); startedAt.current = audioContext.currentTime
    for (const track of playable) {
      const rate = trackRate(track, masterRate), bufferOffset = offset.current * rate
      if (!track.buffer || bufferOffset >= track.buffer.duration) continue
      const node = audioContext.createBufferSource(), gain = audioContext.createGain()
      node.buffer = track.buffer; node.playbackRate.value = rate; gain.gain.value = track.volume * track.clipVolume * masterVolume
      connectVoiceEffects(audioContext, node, gain, [track.voicePreset, track.clipVoicePreset]); gain.connect(audioContext.destination); node.start(0, bufferOffset)
      nodes.current.set(track.id, node); gains.current.set(track.id, gain)
    }
    setPlaying(true)
    const tick = () => {
      const timeNow = Math.min(duration, offset.current + (audioContext.currentTime - startedAt.current))
      onTime(timeNow)
      if (timeNow < duration && nodes.current.size) frame.current = requestAnimationFrame(tick); else stop()
    }
    frame.current = requestAnimationFrame(tick)
  }, [duration, masterRate, masterVolume, onTime, stop, tracks])

  useEffect(() => {
    const audible = new Set(audibleTracks(tracks).map(track => track.id))
    for (const track of tracks) {
      const gain = gains.current.get(track.id)
      if (gain) gain.gain.setTargetAtTime(audible.has(track.id) ? track.volume * track.clipVolume * masterVolume : 0, gain.context.currentTime, .01)
      const node = nodes.current.get(track.id)
      if (node) node.playbackRate.setTargetAtTime(trackRate(track, masterRate), node.context.currentTime, .01)
    }
  }, [masterRate, masterVolume, tracks])

  useEffect(() => {
    const signature = tracks.map(track => `${track.id}:${track.voicePreset}:${track.clipVoicePreset}`).join('|')
    const changed = effectSignature.current !== '' && effectSignature.current !== signature
    effectSignature.current = signature
    if (!changed || !playing || !context.current) return
    const currentTime = offset.current + (context.current.currentTime - startedAt.current)
    void playFrom(currentTime)
  }, [playFrom, playing, tracks])

  useEffect(() => () => { stop(); void context.current?.close() }, [stop])
  return { playing, duration, playFrom, stop }
}
