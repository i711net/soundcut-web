import { useCallback, useEffect, useRef, useState } from 'react'
import { audibleTracks, durationOfTracks, trackRate, type MixerTrack } from './mixer'
import { connectVoiceEffects } from './voice-effects'
import { connectAudioEffects } from './audio-effects'

export type MeterState = { master: { left: number; right: number }; tracks: Record<string, { left: number; right: number }>; clipping: boolean; limiterReduction: number }

const silentMeters: MeterState = { master: { left: 0, right: 0 }, tracks: {}, clipping: false, limiterReduction: 0 }
const analyserPair = (context: AudioContext, source: AudioNode) => {
  const splitter = context.createChannelSplitter(2), left = context.createAnalyser(), right = context.createAnalyser()
  left.fftSize = right.fftSize = 256; left.smoothingTimeConstant = right.smoothingTimeConstant = .55
  source.connect(splitter); splitter.connect(left, 0); splitter.connect(right, 1); return { left, right }
}
const analyserPeak = (analyser: AnalyserNode) => { const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data); let peak = 0; for (const value of data) peak = Math.max(peak, Math.abs(value)); return peak }
const envelopeValue = (points: MixerTrack['clips'][number]['volumeEnvelope'], time: number) => { const sorted = [...(points || [])].sort((a, b) => a.time - b.time); if (!sorted.length) return 1; const next = sorted.find(point => point.time >= time), previous = [...sorted].reverse().find(point => point.time <= time); if (!previous) return next ? 1 + (next.value - 1) * time / Math.max(.0001, next.time) : 1; if (!next || next.id === previous.id) return previous.value; const amount = (time - previous.time) / Math.max(.0001, next.time - previous.time); return previous.value + (next.value - previous.value) * amount }

export function useMixerPlayback(tracks: MixerTrack[], masterRate: number, masterVolume: number, onTime: (time: number) => void) {
  const context = useRef<AudioContext | null>(null)
  const nodes = useRef<Map<string, AudioBufferSourceNode>>(new Map())
  const gains = useRef<Map<string, GainNode>>(new Map())
  const frame = useRef(0), startedAt = useRef(0), offset = useRef(0)
  const effectSignature = useRef('')
  const [playing, setPlaying] = useState(false)
  const [meters, setMeters] = useState<MeterState>(silentMeters)
  const duration = durationOfTracks(tracks, masterRate)

  const stop = useCallback(() => {
    gains.current.forEach(gain => { try { gain.gain.cancelScheduledValues(gain.context.currentTime); gain.gain.setValueAtTime(0, gain.context.currentTime); gain.disconnect() } catch { /* disconnected */ } })
    nodes.current.forEach(node => { try { node.stop(); node.disconnect() } catch { /* ended */ } })
    nodes.current.clear(); gains.current.clear(); cancelAnimationFrame(frame.current); setPlaying(false); setMeters(silentMeters)
    const oldContext = context.current; context.current = null
    if (oldContext && oldContext.state !== 'closed') void oldContext.close().catch(() => undefined)
  }, [])

  const playFrom = useCallback(async (time: number) => {
    stop()
    const audioContext = context.current ?? new AudioContext(); context.current = audioContext; await audioContext.resume()
    const playable = audibleTracks(tracks)
    if (!playable.length) return
    offset.current = Math.max(0, Math.min(time, duration)); startedAt.current = audioContext.currentTime
    const master = audioContext.createGain(), limiter = audioContext.createDynamicsCompressor()
    limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = .003; limiter.release.value = .12
    master.connect(limiter).connect(audioContext.destination)
    const masterMeters = analyserPair(audioContext, limiter), trackMeters = new Map<string, ReturnType<typeof analyserPair>>(), trackBuses = new Map<string, GainNode>()
    for (const track of playable) {
      const rawBus = audioContext.createGain(), bus = audioContext.createGain(); connectAudioEffects(audioContext, rawBus, bus, track.effects); bus.connect(master); trackBuses.set(track.id, bus); trackMeters.set(track.id, analyserPair(audioContext, bus))
      const clips = track.clips
      for (const clip of clips) {
        const rate = trackRate(track, masterRate) * clip.playbackRate, clipEnd = clip.start + clip.duration / rate
        if (offset.current >= clipEnd) continue
        const delay = Math.max(0, clip.start - offset.current), elapsed = Math.max(0, offset.current - clip.start), bufferOffset = clip.offset + elapsed * rate
        if (bufferOffset >= clip.offset + clip.duration) continue
        const node = audioContext.createBufferSource(), gain = audioContext.createGain(), fadeGain = audioContext.createGain(), key = `${track.id}:${clip.id}`
        const level = track.volume * track.clipVolume * clip.volume * masterVolume, startAt = audioContext.currentTime + delay, clipLength = clip.duration / rate
        node.buffer = clip.buffer; node.playbackRate.value = rate
        gain.gain.setValueAtTime(level * envelopeValue(clip.volumeEnvelope, elapsed), startAt)
        for (const point of [...(clip.volumeEnvelope || [])].sort((a, b) => a.time - b.time)) if (point.time > elapsed) gain.gain.linearRampToValueAtTime(level * point.value, startAt + point.time - elapsed)
        const fadeInLevel = clip.fadeIn > 0 && elapsed < clip.fadeIn ? elapsed / clip.fadeIn : 1
        fadeGain.gain.setValueAtTime(fadeInLevel, startAt)
        if (clip.fadeIn > elapsed) fadeGain.gain.linearRampToValueAtTime(1, startAt + clip.fadeIn - elapsed)
        const fadeOutStart = Math.max(0, clipLength - clip.fadeOut)
        if (clip.fadeOut > 0) { const untilFade = Math.max(0, fadeOutStart - elapsed); fadeGain.gain.setValueAtTime(elapsed >= fadeOutStart ? Math.max(0, (clipLength - elapsed) / clip.fadeOut) : 1, startAt + untilFade); fadeGain.gain.linearRampToValueAtTime(0, startAt + Math.max(0, clipLength - elapsed)) }
        const voiceOut = audioContext.createGain(), clipFxOut = audioContext.createGain()
        connectVoiceEffects(audioContext, node, voiceOut, [track.voicePreset, clip.voicePreset]); connectAudioEffects(audioContext, voiceOut, clipFxOut, clip.effects); clipFxOut.connect(gain); gain.connect(fadeGain).connect(rawBus); node.start(startAt, bufferOffset, clip.offset + clip.duration - bufferOffset)
        node.onended = () => nodes.current.delete(key); nodes.current.set(key, node); gains.current.set(key, gain)
      }
    }
    setPlaying(true)
    const tick = () => {
      const timeNow = Math.min(duration, offset.current + (audioContext.currentTime - startedAt.current))
      onTime(timeNow)
      const trackValues: MeterState['tracks'] = {}; let inputClipping = false
      trackMeters.forEach((pair, id) => { const left = analyserPeak(pair.left), right = analyserPeak(pair.right); trackValues[id] = { left, right }; if (Math.max(left, right) >= 1) inputClipping = true })
      const masterLeft = analyserPeak(masterMeters.left), masterRight = analyserPeak(masterMeters.right), reduction = limiter.reduction
      setMeters({ master: { left: masterLeft, right: masterRight }, tracks: trackValues, clipping: inputClipping || reduction < -3, limiterReduction: reduction })
      if (timeNow < duration && nodes.current.size) frame.current = requestAnimationFrame(tick); else stop()
    }
    frame.current = requestAnimationFrame(tick)
  }, [duration, masterRate, masterVolume, onTime, stop, tracks])

  useEffect(() => {
    const audible = new Set(audibleTracks(tracks).map(track => track.id))
    for (const track of tracks) {
      for (const clip of track.clips) {
        const key = `${track.id}:${clip.id}`, gain = gains.current.get(key)
        if (gain && !(clip.volumeEnvelope || []).length) gain.gain.setTargetAtTime(audible.has(track.id) ? track.volume * track.clipVolume * clip.volume * masterVolume : 0, gain.context.currentTime, .01)
        const node = nodes.current.get(key)
        if (node) node.playbackRate.setTargetAtTime(trackRate(track, masterRate) * clip.playbackRate, node.context.currentTime, .01)
      }
    }
  }, [masterRate, masterVolume, tracks])

  useEffect(() => {
    const signature = tracks.map(track => `${track.id}:${track.voicePreset}:${JSON.stringify(track.effects)}:${track.clips.map(clip => `${clip.id}:${clip.voicePreset}:${clip.start}:${clip.offset}:${clip.duration}:${clip.fadeIn}:${clip.fadeOut}:${JSON.stringify(clip.volumeEnvelope || [])}:${JSON.stringify(clip.effects)}`).join(',')}`).join('|')
    const changed = effectSignature.current !== '' && effectSignature.current !== signature
    effectSignature.current = signature
    if (!changed || !playing || !context.current) return
    const currentTime = offset.current + (context.current.currentTime - startedAt.current)
    void playFrom(currentTime)
  }, [playFrom, playing, tracks])

  useEffect(() => () => { stop(); void context.current?.close() }, [stop])
  return { playing, duration, playFrom, stop, meters }
}
