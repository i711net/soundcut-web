export type TrackKind = 'main' | 'video' | 'audio'
export type AudioClip = { id: string; name: string; buffer: AudioBuffer; start: number; offset: number; duration: number; volume: number; playbackRate: number; fadeIn: number; fadeOut: number }

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
export const newClip = (buffer: AudioBuffer, name = '音频片段', start = 0): AudioClip => ({ id: `clip-${clipSequence++}`, name, buffer, start, offset: 0, duration: buffer.duration, volume: 1, playbackRate: 1, fadeIn: 0, fadeOut: 0 })

export const newTrack = (id: string, name: string, kind: TrackKind, buffer: AudioBuffer | null = null): MixerTrack => ({
  id, name, kind, buffer, originalBuffer: buffer, muted: false, solo: false, volume: 1, playbackRate: 1,
  clipVolume: 1, clipPlaybackRate: 1, expanded: false, includeInExport: true,
  voicePreset: 'none', clipVoicePreset: 'none',
  pitchSemitones: 0, clipPitchSemitones: 0, appliedPitchSemitones: 0,
  clips: buffer ? [newClip(buffer, name)] : [],
})

export function audibleTracks(tracks: MixerTrack[]) {
  const hasSolo = tracks.some(track => track.solo && track.buffer)
  return tracks.filter(track => track.buffer && !track.muted && (!hasSolo || track.solo))
}

export const trackRate = (track: MixerTrack, masterRate = 1) => masterRate * track.playbackRate * track.clipPlaybackRate

export function durationOfTracks(tracks: MixerTrack[], masterRate = 1) {
  return Math.max(0, ...tracks.flatMap(track => track.clips.length ? track.clips.map(clip => clip.start + clip.duration / (trackRate(track, masterRate) * clip.playbackRate)) : track.buffer ? [track.buffer.duration / trackRate(track, masterRate)] : [0]))
}

export async function mixTracks(tracks: MixerTrack[], selectedOnly = true, masterRate = 1, masterVolume = 1) {
  const sources = tracks.filter(track => (track.clips.length || track.buffer) && (!selectedOnly || track.includeInExport))
  if (!sources.length) throw new Error('没有可导出的轨道')
  const allBuffers = sources.flatMap(track => track.clips.length ? track.clips.map(clip => clip.buffer) : track.buffer ? [track.buffer] : [])
  const sampleRate = Math.max(...allBuffers.map(buffer => buffer.sampleRate))
  const channels = Math.max(...allBuffers.map(buffer => buffer.numberOfChannels))
  const duration = durationOfTracks(sources, masterRate)
  const context = new OfflineAudioContext(channels, Math.ceil(duration * sampleRate), sampleRate)
  for (const track of sources) {
    const clips = track.clips.length ? track.clips : track.buffer ? [newClip(track.buffer, track.name)] : []
    for (const clip of clips) {
      const node = context.createBufferSource(), gain = context.createGain(), rate = trackRate(track, masterRate) * clip.playbackRate
      node.buffer = clip.buffer; node.playbackRate.value = rate
      gain.gain.value = track.muted ? 0 : track.volume * track.clipVolume * clip.volume * masterVolume
      connectVoiceEffects(context, node, gain, [track.voicePreset, track.clipVoicePreset]); gain.connect(context.destination); node.start(clip.start, clip.offset, clip.duration)
    }
  }
  return context.startRendering()
}
import { connectVoiceEffects, type VoicePreset } from './voice-effects'
