export type TrackKind = 'main' | 'video' | 'audio'

export type MixerTrack = {
  id: string
  name: string
  kind: TrackKind
  buffer: AudioBuffer | null
  muted: boolean
  solo: boolean
  volume: number
  includeInExport: boolean
}

export const newTrack = (id: string, name: string, kind: TrackKind, buffer: AudioBuffer | null = null): MixerTrack => ({
  id, name, kind, buffer, muted: false, solo: false, volume: 1, includeInExport: true,
})

export function audibleTracks(tracks: MixerTrack[]) {
  const hasSolo = tracks.some(track => track.solo && track.buffer)
  return tracks.filter(track => track.buffer && !track.muted && (!hasSolo || track.solo))
}

export function durationOfTracks(tracks: MixerTrack[]) {
  return Math.max(0, ...tracks.map(track => track.buffer?.duration || 0))
}

export async function mixTracks(tracks: MixerTrack[], selectedOnly = true) {
  const sources = tracks.filter(track => track.buffer && (!selectedOnly || track.includeInExport))
  if (!sources.length) throw new Error('没有可导出的轨道')
  const sampleRate = Math.max(...sources.map(track => track.buffer!.sampleRate))
  const channels = Math.max(...sources.map(track => track.buffer!.numberOfChannels))
  const duration = Math.max(...sources.map(track => track.buffer!.duration))
  const context = new OfflineAudioContext(channels, Math.ceil(duration * sampleRate), sampleRate)
  for (const track of sources) {
    const node = context.createBufferSource(), gain = context.createGain()
    node.buffer = track.buffer; gain.gain.value = track.muted ? 0 : track.volume
    node.connect(gain).connect(context.destination); node.start()
  }
  return context.startRendering()
}
