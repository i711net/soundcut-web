export type VoicePreset = 'none' | 'child' | 'elder' | 'robot' | 'female' | 'cartoon' | 'opera' | 'deep' | 'comedy'

export const voicePresets: Array<{ value: VoicePreset; label: string }> = [
  { value: 'none', label: '原声' }, { value: 'child', label: '儿童感' }, { value: 'elder', label: '老年感' },
  { value: 'robot', label: '机器人' }, { value: 'female', label: '女声感' }, { value: 'cartoon', label: '卡通高音' },
  { value: 'opera', label: '猴王戏曲感' }, { value: 'deep', label: '憨厚低音' }, { value: 'comedy', label: '喜剧男声' },
]
export const presetPitch: Record<VoicePreset, number> = { none: 0, child: 5, elder: -2, robot: 0, female: 3, cartoon: 7, opera: 2, deep: -5, comedy: -1 }

function effectNode(context: BaseAudioContext, preset: VoicePreset): AudioNode | null {
  if (preset === 'none') return null
  if (preset === 'robot') {
    const shaper = context.createWaveShaper(), curve = new Float32Array(1024)
    for (let i = 0; i < curve.length; i++) { const x = i * 2 / curve.length - 1; curve[i] = Math.tanh(x * 6) * .72 }
    shaper.curve = curve; shaper.oversample = '2x'; return shaper
  }
  const filter = context.createBiquadFilter()
  const settings: Record<Exclude<VoicePreset, 'none' | 'robot'>, [BiquadFilterType, number, number, number]> = {
    child: ['highpass', 240, .8, 0], elder: ['lowpass', 3100, .7, 0], female: ['peaking', 2800, 1.1, 5],
    cartoon: ['highpass', 380, 1.3, 0], opera: ['bandpass', 1900, 1.8, 0], deep: ['lowshelf', 260, .7, 8], comedy: ['peaking', 1250, 1.5, 6],
  }
  const [type, frequency, q, gain] = settings[preset]
  filter.type = type; filter.frequency.value = frequency; filter.Q.value = q; filter.gain.value = gain
  return filter
}

export function connectVoiceEffects(context: BaseAudioContext, source: AudioNode, destination: AudioNode, presets: VoicePreset[]) {
  let tail = source
  for (const preset of presets) {
    const node = effectNode(context, preset)
    if (node) { tail.connect(node); tail = node }
  }
  tail.connect(destination)
}
