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
    gains.current.forEach(gain => { try { gain.gain.cancelScheduledValues(gain.context.currentTime); gain.gain.setValueAtTime(0, gain.context.currentTime); gain.disconnect() } catch { /* disconnected */ } })
    nodes.current.forEach(node => { try { node.stop(); node.disconnect() } catch { /* ended */ } })
    nodes.current.clear(); gains.current.clear(); cancelAnimationFrame(frame.current); setPlaying(false)
  }, [])

  const playFrom = useCallback(async (time: number) => {
    stop()
    const audioContext = context.current ?? new AudioContext(); context.current = audioContext; await audioContext.resume()
    const playable = audibleTracks(tracks)
    if (!playable.length) return
    offset.current = Math.max(0, Math.min(time, duration)); startedAt.current = audioContext.currentTime
    for (const track of playable) {
      const clips = track.clips
      for (const clip of clips) {
        const rate = trackRate(track, masterRate) * clip.playbackRate, clipEnd = clip.start + clip.duration / rate
        if (offset.current >= clipEnd) continue
        const delay = Math.max(0, clip.start - offset.current), elapsed = Math.max(0, offset.current - clip.start), bufferOffset = clip.offset + elapsed * rate
        if (bufferOffset >= clip.offset + clip.duration) continue
        const node = audioContext.createBufferSource(), gain = audioContext.createGain(), key = `${track.id}:${clip.id}`
        node.buffer = clip.buffer; node.playbackRate.value = rate; gain.gain.value = track.volume * track.clipVolume * clip.volume * masterVolume
        connectVoiceEffects(audioContext, node, gain, [track.voicePreset, clip.voicePreset]); gain.connect(audioContext.destination); node.start(audioContext.currentTime + delay, bufferOffset, clip.offset + clip.duration - bufferOffset)
        node.onended = () => nodes.current.delete(key); nodes.current.set(key, node); gains.current.set(key, gain)
      }
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
      for (const clip of track.clips) {
        const key = `${track.id}:${clip.id}`, gain = gains.current.get(key)
        if (gain) gain.gain.setTargetAtTime(audible.has(track.id) ? track.volume * track.clipVolume * clip.volume * masterVolume : 0, gain.context.currentTime, .01)
        const node = nodes.current.get(key)
        if (node) node.playbackRate.setTargetAtTime(trackRate(track, masterRate) * clip.playbackRate, node.context.currentTime, .01)
      }
    }
  }, [masterRate, masterVolume, tracks])

  useEffect(() => {
    const signature = tracks.map(track => `${track.id}:${track.voicePreset}:${track.clips.map(clip => `${clip.id}:${clip.voicePreset}`).join(',')}`).join('|')
    const changed = effectSignature.current !== '' && effectSignature.current !== signature
    effectSignature.current = signature
    if (!changed || !playing || !context.current) return
    const currentTime = offset.current + (context.current.currentTime - startedAt.current)
    void playFrom(currentTime)
  }, [playFrom, playing, tracks])

  useEffect(() => () => { stop(); void context.current?.close() }, [stop])
  return { playing, duration, playFrom, stop }
}
