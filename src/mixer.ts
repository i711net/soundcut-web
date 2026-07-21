export type TrackKind = 'main' | 'video' | 'audio'

export type MixerTrack = {
  id: string
  name: string
  kind: TrackKind
  buffer: AudioBuffer | null
  muted: boolean
  solo: boolean
  volume: number
  playbackRate: number
  clipVolume: number
  clipPlaybackRate: number
  expanded: boolean
  voicePreset: VoicePreset
  clipVoicePreset: VoicePreset
  includeInExport: boolean
}

export const newTrack = (id: string, name: string, kind: TrackKind, buffer: AudioBuffer | null = null): MixerTrack => ({
  id, name, kind, buffer, muted: false, solo: false, volume: 1, playbackRate: 1,
  clipVolume: 1, clipPlaybackRate: 1, expanded: false, includeInExport: true,
  voicePreset: 'none', clipVoicePreset: 'none',
})

export function audibleTracks(tracks: MixerTrack[]) {
  const hasSolo = tracks.some(track => track.solo && track.buffer)
  return tracks.filter(track => track.buffer && !track.muted && (!hasSolo || track.solo))
}

export const trackRate = (track: MixerTrack, masterRate = 1) => masterRate * track.playbackRate * track.clipPlaybackRate

export function durationOfTracks(tracks: MixerTrack[], masterRate = 1) {
  return Math.max(0, ...tracks.map(track => track.buffer ? track.buffer.duration / trackRate(track, masterRate) : 0))
}

export async function mixTracks(tracks: MixerTrack[], selectedOnly = true, masterRate = 1, masterVolume = 1) {
  const sources = tracks.filter(track => track.buffer && (!selectedOnly || track.includeInExport))
  if (!sources.length) throw new Error('没有可导出的轨道')
  const sampleRate = Math.max(...sources.map(track => track.buffer!.sampleRate))
  const channels = Math.max(...sources.map(track => track.buffer!.numberOfChannels))
  const duration = Math.max(...sources.map(track => track.buffer!.duration / trackRate(track, masterRate)))
  const context = new OfflineAudioContext(channels, Math.ceil(duration * sampleRate), sampleRate)
  for (const track of sources) {
    const node = context.createBufferSource(), gain = context.createGain()
    node.buffer = track.buffer; node.playbackRate.value = trackRate(track, masterRate)
    gain.gain.value = track.muted ? 0 : track.volume * track.clipVolume * masterVolume
    connectVoiceEffects(context, node, gain, [track.voicePreset, track.clipVoicePreset]); gain.connect(context.destination); node.start()
  }
  return context.startRendering()
}
import { connectVoiceEffects, type VoicePreset } from './voice-effects'
