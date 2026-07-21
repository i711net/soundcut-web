export type TrackKind = 'main' | 'video' | 'audio'
export type AutomationPoint = { id: string; time: number; value: number }
export type AudioClip = { id: string; name: string; buffer: AudioBuffer; start: number; offset: number; duration: number; volume: number; playbackRate: number; fadeIn: number; fadeOut: number; volumeEnvelope: AutomationPoint[]; voicePreset: VoicePreset; pitchSemitones: number; originalBuffer?: AudioBuffer; originalOffset?: number; originalDuration?: number }

export type MixerTrack = {
  id: string
  name: string
  kind: TrackKind
  buffer: AudioBuffer | null
  originalBuffer: AudioBuffer | null
  muted: boolean
  solo: boolean
  volume: number
  playbackRate: number
  clipVolume: number
  clipPlaybackRate: number
  expanded: boolean
  voicePreset: VoicePreset
  clipVoicePreset: VoicePreset
  pitchSemitones: number
  clipPitchSemitones: number
  appliedPitchSemitones: number
  includeInExport: boolean
  clips: AudioClip[]
}

let clipSequence = 1
export const newClip = (buffer: AudioBuffer, name = '音频片段', start = 0): AudioClip => ({ id: `clip-${clipSequence++}`, name, buffer, start, offset: 0, duration: buffer.duration, volume: 1, playbackRate: 1, fadeIn: 0, fadeOut: 0, volumeEnvelope: [], voicePreset: 'none', pitchSemitones: 0 })

export const newTrack = (id: string, name: string, kind: TrackKind, buffer: AudioBuffer | null = null): MixerTrack => ({
  id, name, kind, buffer, originalBuffer: buffer, muted: false, solo: false, volume: 1, playbackRate: 1,
  clipVolume: 1, clipPlaybackRate: 1, expanded: false, includeInExport: true,
  voicePreset: 'none', clipVoicePreset: 'none',
  pitchSemitones: 0, clipPitchSemitones: 0, appliedPitchSemitones: 0,
  clips: buffer ? [newClip(buffer, name)] : [],
})

export function audibleTracks(tracks: MixerTrack[]) {
  const hasSolo = tracks.some(track => track.solo && track.clips.length)
  return tracks.filter(track => track.clips.length && !track.muted && (!hasSolo || track.solo))
}

export const trackRate = (track: MixerTrack, masterRate = 1) => masterRate * track.playbackRate * track.clipPlaybackRate

export function durationOfTracks(tracks: MixerTrack[], masterRate = 1) {
  return Math.max(0, ...tracks.flatMap(track => track.clips.map(clip => clip.start + clip.duration / (trackRate(track, masterRate) * clip.playbackRate))))
}

export async function mixTracks(tracks: MixerTrack[], selectedOnly = true, masterRate = 1, masterVolume = 1) {
  const sources = tracks.filter(track => track.clips.length && (!selectedOnly || track.includeInExport))
  if (!sources.length) throw new Error('没有可导出的轨道')
  const allBuffers = sources.flatMap(track => track.clips.map(clip => clip.buffer))
  const sampleRate = Math.max(...allBuffers.map(buffer => buffer.sampleRate))
  const channels = Math.max(...allBuffers.map(buffer => buffer.numberOfChannels))
  const duration = durationOfTracks(sources, masterRate)
  const context = new OfflineAudioContext(channels, Math.ceil(duration * sampleRate), sampleRate)
  const master = context.createGain(), limiter = context.createDynamicsCompressor()
  limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = .003; limiter.release.value = .12
  master.connect(limiter).connect(context.destination)
  for (const track of sources) {
    const clips = track.clips
    for (const clip of clips) {
      const node = context.createBufferSource(), gain = context.createGain(), fadeGain = context.createGain(), rate = trackRate(track, masterRate) * clip.playbackRate
      node.buffer = clip.buffer; node.playbackRate.value = rate
      const level = track.muted ? 0 : track.volume * track.clipVolume * clip.volume * masterVolume, clipLength = clip.duration / rate
      const points = [...(clip.volumeEnvelope || [])].sort((a, b) => a.time - b.time)
      gain.gain.setValueAtTime(level * (points[0]?.time === 0 ? points[0].value : 1), clip.start)
      for (const point of points) gain.gain.linearRampToValueAtTime(level * point.value, clip.start + Math.min(clipLength, point.time))
      fadeGain.gain.setValueAtTime(clip.fadeIn > 0 ? 0 : 1, clip.start)
      if (clip.fadeIn > 0) fadeGain.gain.linearRampToValueAtTime(1, clip.start + Math.min(clip.fadeIn, clipLength))
      if (clip.fadeOut > 0) { fadeGain.gain.setValueAtTime(1, Math.max(clip.start, clip.start + clipLength - clip.fadeOut)); fadeGain.gain.linearRampToValueAtTime(0, clip.start + clipLength) }
      connectVoiceEffects(context, node, gain, [track.voicePreset, clip.voicePreset]); gain.connect(fadeGain).connect(master); node.start(clip.start, clip.offset, clip.duration)
    }
  }
  return context.startRendering()
}
import { connectVoiceEffects, type VoicePreset } from './voice-effects'
