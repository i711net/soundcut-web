import type { MixerTrack } from './mixer'
import type { TranscriptSegment } from './transcript'
import { defaultAudioEffects } from './audio-effects'

const DB_NAME = 'soundcut-projects'
const STORE_NAME = 'autosave'
const AUTOSAVE_KEY = 'current-project'

type StoredBuffer = { id: string; sampleRate: number; length: number; channels: Float32Array[] }
type StoredClip = Omit<MixerTrack['clips'][number], 'buffer' | 'originalBuffer'> & { bufferId: string; originalBufferId?: string }
type StoredTrack = Omit<MixerTrack, 'buffer' | 'originalBuffer' | 'clips'> & { bufferId?: string; originalBufferId?: string; clips: StoredClip[] }

export type ProjectSettings = {
  fileName: string
  activeId: string
  selection: [number, number]
  selectedClipId: string
  speed: number
  masterVolume: number
  snapEnabled: boolean
  snapGap: number
  timelinePadding: number
  timelineZoom?: number
  compactTracks: boolean
  transcript: TranscriptSegment[]
  language: string
  contentMode: 'speech' | 'song'
  exportFormat: string
}

export type StoredProject = {
  format: 'soundcut-project'
  version: 1
  savedAt: string
  settings: ProjectSettings
  tracks: StoredTrack[]
  buffers: StoredBuffer[]
}

export function serializeProject(tracks: MixerTrack[], settings: ProjectSettings): StoredProject {
  const ids = new Map<AudioBuffer, string>()
  const buffers: StoredBuffer[] = []
  const bufferId = (buffer: AudioBuffer | null | undefined) => {
    if (!buffer) return undefined
    const known = ids.get(buffer)
    if (known) return known
    const id = `audio-${ids.size + 1}`
    ids.set(buffer, id)
    buffers.push({ id, sampleRate: buffer.sampleRate, length: buffer.length, channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) => new Float32Array(buffer.getChannelData(channel))) })
    return id
  }
  const storedTracks = tracks.map(track => {
    const { buffer, originalBuffer, clips, ...trackSettings } = track
    return {
      ...trackSettings, effects: trackSettings.effects || defaultAudioEffects(),
      bufferId: bufferId(buffer),
      originalBufferId: bufferId(originalBuffer),
      clips: clips.map(clip => {
        const { buffer: clipBuffer, originalBuffer: originalClipBuffer, ...clipSettings } = clip
        return { ...clipSettings, bufferId: bufferId(clipBuffer)!, originalBufferId: bufferId(originalClipBuffer) }
      }),
    }
  })
  return { format: 'soundcut-project', version: 1, savedAt: new Date().toISOString(), settings, tracks: storedTracks, buffers }
}

export function deserializeProject(project: StoredProject): { tracks: MixerTrack[]; settings: ProjectSettings } {
  if (project.format !== 'soundcut-project' || project.version !== 1 || !Array.isArray(project.tracks) || !Array.isArray(project.buffers)) throw new Error('不支持的工程文件')
  const buffers = new Map(project.buffers.map(stored => {
    const buffer = new AudioBuffer({ length: stored.length, numberOfChannels: stored.channels.length, sampleRate: stored.sampleRate })
    stored.channels.forEach((channel, index) => buffer.copyToChannel(Float32Array.from(channel), index))
    return [stored.id, buffer] as const
  }))
  const tracks = project.tracks.map(stored => {
    const { bufferId, originalBufferId, clips, ...trackSettings } = stored
    return {
      ...trackSettings,
      buffer: bufferId ? buffers.get(bufferId) || null : null,
      originalBuffer: originalBufferId ? buffers.get(originalBufferId) || null : null,
      clips: clips.map(storedClip => {
        const { bufferId: clipBufferId, originalBufferId: originalClipBufferId, ...clipSettings } = storedClip
        const buffer = buffers.get(clipBufferId)
        if (!buffer) throw new Error('工程音频数据不完整')
        return { ...clipSettings, timeStretchRate: clipSettings.timeStretchRate || 1, appliedTimeStretchRate: clipSettings.appliedTimeStretchRate || 1, volumeEnvelope: clipSettings.volumeEnvelope || [], effects: clipSettings.effects || defaultAudioEffects(), buffer, originalBuffer: originalClipBufferId ? buffers.get(originalClipBufferId) : undefined }
      }),
    } satisfies MixerTrack
  })
  return { tracks, settings: project.settings }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value), bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function projectToBlob(project: StoredProject) {
  const portable = { ...project, buffers: project.buffers.map(buffer => ({ ...buffer, channels: buffer.channels.map(channel => bytesToBase64(new Uint8Array(channel.buffer, channel.byteOffset, channel.byteLength))) })) }
  return new Blob([JSON.stringify(portable)], { type: 'application/x-soundcut-project' })
}

export async function projectFromFile(file: File): Promise<StoredProject> {
  const portable = JSON.parse(await file.text()) as Omit<StoredProject, 'buffers'> & { buffers: Array<Omit<StoredBuffer, 'channels'> & { channels: string[] }> }
  return { ...portable, buffers: portable.buffers.map(buffer => ({ ...buffer, channels: buffer.channels.map(channel => { const bytes = base64ToBytes(channel); return new Float32Array(bytes.buffer) }) })) }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveAutosave(project: StoredProject) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(project, AUTOSAVE_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export async function loadAutosave() {
  const database = await openDatabase()
  const project = await new Promise<StoredProject | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(AUTOSAVE_KEY)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return project
}
