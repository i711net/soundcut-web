export type EditSettings = { start: number; end: number; gain: number; fadeIn: number; fadeOut: number }

export function renderBuffer(source: AudioBuffer, settings: EditSettings): AudioBuffer {
  const startFrame = Math.floor(settings.start * source.sampleRate)
  const endFrame = Math.ceil(settings.end * source.sampleRate)
  const length = Math.max(1, endFrame - startFrame)
  const output = new AudioBuffer({ length, numberOfChannels: source.numberOfChannels, sampleRate: source.sampleRate })
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    const input = source.getChannelData(channel)
    const target = output.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      const time = i / source.sampleRate
      const fadeInGain = settings.fadeIn > 0 ? Math.min(1, time / settings.fadeIn) : 1
      const remaining = (length - i) / source.sampleRate
      const fadeOutGain = settings.fadeOut > 0 ? Math.min(1, remaining / settings.fadeOut) : 1
      target[i] = (input[startFrame + i] ?? 0) * settings.gain * fadeInGain * fadeOutGain
    }
  }
  return output
}

export function removeRange(source: AudioBuffer, from: number, to: number): AudioBuffer {
  const a = Math.floor(from * source.sampleRate)
  const b = Math.ceil(to * source.sampleRate)
  const output = new AudioBuffer({ length: source.length - (b - a), numberOfChannels: source.numberOfChannels, sampleRate: source.sampleRate })
  for (let c = 0; c < source.numberOfChannels; c++) {
    const input = source.getChannelData(c)
    const target = output.getChannelData(c)
    target.set(input.subarray(0, a), 0)
    target.set(input.subarray(b), a)
  }
  return output
}

export function insertBuffer(source: AudioBuffer, fragment: AudioBuffer, at: number): AudioBuffer {
  const position = Math.max(0, Math.min(source.length, Math.round(at * source.sampleRate)))
  const fragmentLength = Math.max(1, Math.round(fragment.duration * source.sampleRate))
  const channels = Math.max(source.numberOfChannels, fragment.numberOfChannels)
  const output = new AudioBuffer({ length: source.length + fragmentLength, numberOfChannels: channels, sampleRate: source.sampleRate })
  for (let c = 0; c < channels; c++) {
    const target = output.getChannelData(c), input = source.getChannelData(Math.min(c, source.numberOfChannels - 1)), addition = fragment.getChannelData(Math.min(c, fragment.numberOfChannels - 1))
    target.set(input.subarray(0, position)); target.set(input.subarray(position), position + fragmentLength)
    for (let i = 0; i < fragmentLength; i++) target[position + i] = addition[Math.min(addition.length - 1, Math.floor(i * fragment.sampleRate / source.sampleRate))] || 0
  }
  return output
}

export function placeBuffer(source: AudioBuffer, fragment: AudioBuffer, at: number): AudioBuffer {
  const position = Math.max(0, Math.round(at * source.sampleRate)), fragmentLength = Math.max(1, Math.round(fragment.duration * source.sampleRate))
  const channels = Math.max(source.numberOfChannels, fragment.numberOfChannels), length = Math.max(source.length, position + fragmentLength)
  const output = new AudioBuffer({ length, numberOfChannels: channels, sampleRate: source.sampleRate })
  for (let c = 0; c < channels; c++) {
    const target = output.getChannelData(c), input = source.getChannelData(Math.min(c, source.numberOfChannels - 1)), addition = fragment.getChannelData(Math.min(c, fragment.numberOfChannels - 1))
    target.set(input)
    for (let i = 0; i < fragmentLength; i++) target[position + i] = addition[Math.min(addition.length - 1, Math.floor(i * fragment.sampleRate / source.sampleRate))] || 0
  }
  return output
}

export function moveRange(source: AudioBuffer, from: number, to: number, newStart: number): AudioBuffer {
  const start = Math.max(0, Math.min(source.duration, from)), end = Math.max(start, Math.min(source.duration, to)), duration = end - start
  if (duration < .001) return source
  const target = Math.max(0, Math.min(source.duration - duration, newStart))
  if (Math.abs(target - start) < .001) return source
  const fragment = renderBuffer(source, { start, end, gain: 1, fadeIn: 0, fadeOut: 0 })
  const output = new AudioBuffer({ length: source.length, numberOfChannels: source.numberOfChannels, sampleRate: source.sampleRate })
  for (let c = 0; c < source.numberOfChannels; c++) {
    const input = source.getChannelData(c), result = output.getChannelData(c), moved = fragment.getChannelData(Math.min(c, fragment.numberOfChannels - 1)), fromFrame = Math.floor(start * source.sampleRate), toFrame = Math.ceil(end * source.sampleRate), targetFrame = Math.round(target * source.sampleRate)
    result.set(input); result.fill(0, fromFrame, toFrame)
    for (let i = 0; i < moved.length && targetFrame + i < result.length; i++) result[targetFrame + i] = moved[i]
  }
  return output
}

export function transformRange(source: AudioBuffer, from: number, to: number, mode: 'silence' | 'reverse' | 'normalize' | 'fadeIn' | 'fadeOut'): AudioBuffer {
  const start = Math.max(0, Math.min(source.length, Math.floor(from * source.sampleRate))), end = Math.max(start, Math.min(source.length, Math.ceil(to * source.sampleRate)))
  const output = new AudioBuffer({ length: source.length, numberOfChannels: source.numberOfChannels, sampleRate: source.sampleRate })
  let peak = 0
  if (mode === 'normalize') for (let c = 0; c < source.numberOfChannels; c++) for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(source.getChannelData(c)[i]))
  for (let c = 0; c < source.numberOfChannels; c++) {
    const input = source.getChannelData(c), target = output.getChannelData(c); target.set(input)
    for (let i = start; i < end; i++) {
      const progress = (i - start) / Math.max(1, end - start - 1)
      if (mode === 'silence') target[i] = 0
      else if (mode === 'reverse') target[i] = input[end - 1 - (i - start)]
      else if (mode === 'normalize') target[i] = input[i] * (peak > 0 ? .98 / peak : 1)
      else if (mode === 'fadeIn') target[i] = input[i] * progress
      else target[i] = input[i] * (1 - progress)
    }
  }
  return output
}

export function bufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels
  const size = buffer.length * channels * 2
  const view = new DataView(new ArrayBuffer(44 + size))
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, 36 + size, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, size, true)
  let offset = 44
  for (let i = 0; i < buffer.length; i++) for (let c = 0; c < channels; c++) {
    const sample = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); offset += 2
  }
  return new Blob([view], { type: 'audio/wav' })
}

export function formatTime(value: number, precise = false) {
  const safe = Math.max(0, value || 0)
  const minutes = Math.floor(safe / 60)
  const seconds = Math.floor(safe % 60)
  const ms = Math.floor((safe % 1) * 1000)
  return precise ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function separateStereo(source: AudioBuffer, mode: 'vocals' | 'instrumental') {
  if (source.numberOfChannels < 2) throw new Error('单声道音频无法进行快速人声分离')
  const output = new AudioBuffer({ length: source.length, numberOfChannels: 2, sampleRate: source.sampleRate })
  const left = source.getChannelData(0), right = source.getChannelData(1), outLeft = output.getChannelData(0), outRight = output.getChannelData(1)
  for (let i = 0; i < source.length; i++) {
    const center = (left[i] + right[i]) * .5
    if (mode === 'vocals') outLeft[i] = outRight[i] = center
    else { outLeft[i] = left[i] - center; outRight[i] = right[i] - center }
  }
  return output
}

export type ChannelProcessOptions = { leftGain: number; rightGain: number; pan: number; muteLeft?: boolean; muteRight?: boolean; swap?: boolean; invertLeft?: boolean; invertRight?: boolean; mono?: boolean; forceStereo?: boolean }

export function processChannels(source: AudioBuffer, options: ChannelProcessOptions) {
  const outputChannels = options.mono ? 1 : options.forceStereo ? 2 : source.numberOfChannels
  const output = new AudioBuffer({ length: source.length, numberOfChannels: outputChannels, sampleRate: source.sampleRate })
  const left = source.getChannelData(0), right = source.getChannelData(Math.min(1, source.numberOfChannels - 1))
  const panLeft = options.pan > 0 ? 1 - options.pan : 1, panRight = options.pan < 0 ? 1 + options.pan : 1
  for (let i = 0; i < source.length; i++) {
    let l = (options.swap ? right[i] : left[i]) * options.leftGain * panLeft, r = (options.swap ? left[i] : right[i]) * options.rightGain * panRight
    if (options.muteLeft) l = 0; if (options.muteRight) r = 0
    if (options.invertLeft) l *= -1; if (options.invertRight) r *= -1
    if (outputChannels === 1) output.getChannelData(0)[i] = (l + r) * .5
    else { output.getChannelData(0)[i] = l; output.getChannelData(1)[i] = r }
  }
  return output
}

export function extractChannel(source: AudioBuffer, channel: 0 | 1) {
  const output = new AudioBuffer({ length: source.length, numberOfChannels: 1, sampleRate: source.sampleRate })
  output.copyToChannel(source.getChannelData(Math.min(channel, source.numberOfChannels - 1)), 0)
  return output
}
