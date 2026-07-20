import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

export type AudioExportFormat = 'wav' | 'mp3' | 'm4a' | 'flac' | 'ogg'
let ffmpegPromise: Promise<FFmpeg> | null = null

async function getFFmpeg() {
  if (!ffmpegPromise) ffmpegPromise = (async () => {
    const ffmpeg = new FFmpeg()
    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'
    await ffmpeg.load({ coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'), wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm') })
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
