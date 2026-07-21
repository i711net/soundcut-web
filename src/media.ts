import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
const coreURL = new URL('../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', import.meta.url).href
const wasmURL = new URL('../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm', import.meta.url).href

export type AudioExportFormat = 'wav' | 'mp3' | 'm4a' | 'flac' | 'ogg'
let ffmpegPromise: Promise<FFmpeg> | null = null

async function getFFmpeg() {
  if (!ffmpegPromise) ffmpegPromise = (async () => {
    const ffmpeg = new FFmpeg()
    const parts = await Promise.all([0, 1].map(async index => {
      const response = await fetch(`${wasmURL}.part${index}`)
      if (!response.ok) throw new Error(`FFmpeg 核心分片加载失败：${response.status}`)
      return response.arrayBuffer()
    }))
    const localWasmURL = URL.createObjectURL(new Blob(parts, { type: 'application/wasm' }))
    try { await ffmpeg.load({ coreURL, wasmURL: localWasmURL }) }
    finally { URL.revokeObjectURL(localWasmURL) }
    return ffmpeg
  })()
  return ffmpegPromise
}

const extensionOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || 'bin'

export async function extractAudioFromVideo(file: File) {
  const ffmpeg = await getFFmpeg(), input = `source.${extensionOf(file.name)}`, output = 'extracted.wav'
  await ffmpeg.writeFile(input, await fetchFile(file))
  try {
    await ffmpeg.exec(['-i', input, '-vn', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', output])
    const data = await ffmpeg.readFile(output)
    if (typeof data === 'string') throw new Error('视频音轨读取失败')
    return new Blob([data.slice().buffer], { type: 'audio/wav' })
  } finally { await ffmpeg.deleteFile(input).catch(() => undefined); await ffmpeg.deleteFile(output).catch(() => undefined) }
}

const options = {
  mp3: { args: ['-codec:a', 'libmp3lame', '-b:a', '192k'], mime: 'audio/mpeg' },
  m4a: { args: ['-codec:a', 'aac', '-b:a', '192k'], mime: 'audio/mp4' },
  flac: { args: ['-codec:a', 'flac'], mime: 'audio/flac' },
  ogg: { args: ['-codec:a', 'libvorbis', '-q:a', '5'], mime: 'audio/ogg' },
} satisfies Record<Exclude<AudioExportFormat, 'wav'>, { args: string[]; mime: string }>

export async function convertWav(wav: Blob, format: Exclude<AudioExportFormat, 'wav'>) {
  const ffmpeg = await getFFmpeg(), input = 'edited.wav', output = `soundcut.${format}`, option = options[format]
  await ffmpeg.writeFile(input, await fetchFile(wav))
  try {
    await ffmpeg.exec(['-i', input, ...option.args, output])
    const data = await ffmpeg.readFile(output)
    if (typeof data === 'string') throw new Error('音频编码失败')
    return new Blob([data.slice().buffer], { type: option.mime })
  } finally { await ffmpeg.deleteFile(input).catch(() => undefined); await ffmpeg.deleteFile(output).catch(() => undefined) }
}

export async function pitchShiftWav(wav: Blob, semitones: number, sampleRate = 44100) {
  if (Math.abs(semitones) < .01) return wav
  const ffmpeg = await getFFmpeg(), id = Date.now().toString(36), input = `pitch-${id}.wav`, output = `pitched-${id}.wav`
  const factor = 2 ** (semitones / 12), compensate = 1 / factor
  await ffmpeg.writeFile(input, await fetchFile(wav))
  try {
    await ffmpeg.exec(['-i', input, '-af', `asetrate=${sampleRate}*${factor.toFixed(8)},aresample=${sampleRate},atempo=${compensate.toFixed(8)}`, '-ar', String(sampleRate), '-acodec', 'pcm_s16le', output])
    const data = await ffmpeg.readFile(output)
    if (typeof data === 'string') throw new Error('歌曲变调失败')
    return new Blob([data.slice().buffer], { type: 'audio/wav' })
  } finally { await ffmpeg.deleteFile(input).catch(() => undefined); await ffmpeg.deleteFile(output).catch(() => undefined) }
}

const atempoChain = (rate: number) => { const values: number[] = []; let remaining = rate; while (remaining > 2) { values.push(2); remaining /= 2 } while (remaining < .5) { values.push(.5); remaining /= .5 } values.push(remaining); return values.map(value => `atempo=${value.toFixed(8)}`) }

export async function transformPitchAndTempoWav(wav: Blob, semitones: number, tempo: number, sampleRate = 44100) {
  if (Math.abs(semitones) < .01 && Math.abs(tempo - 1) < .001) return wav
  const ffmpeg = await getFFmpeg(), id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, input = `transform-${id}.wav`, output = `transformed-${id}.wav`, filters: string[] = []
  if (Math.abs(semitones) >= .01) { const factor = 2 ** (semitones / 12); filters.push(`asetrate=${sampleRate}*${factor.toFixed(8)}`, `aresample=${sampleRate}`, ...atempoChain(1 / factor)) }
  if (Math.abs(tempo - 1) >= .001) filters.push(...atempoChain(tempo))
  await ffmpeg.writeFile(input, await fetchFile(wav))
  try { await ffmpeg.exec(['-i', input, '-af', filters.join(','), '-ar', String(sampleRate), '-acodec', 'pcm_s16le', output]); const data = await ffmpeg.readFile(output); if (typeof data === 'string') throw new Error('速度与音高处理失败'); return new Blob([data.slice().buffer], { type: 'audio/wav' }) }
  finally { await ffmpeg.deleteFile(input).catch(() => undefined); await ffmpeg.deleteFile(output).catch(() => undefined) }
}
