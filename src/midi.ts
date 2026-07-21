export type MidiNote = { id: string; pitch: number; start: number; duration: number; velocity: number; channel: number }
export type MidiProject = { name: string; duration: number; bpm: number; notes: MidiNote[] }
type RawEvent = { tick: number; type: 'on' | 'off'; pitch: number; velocity: number; channel: number }
type Tempo = { tick: number; microseconds: number }

const readVar = (view: DataView, position: { value: number }) => { let value = 0, byte = 0; do { byte = view.getUint8(position.value++); value = value << 7 | byte & 0x7f } while (byte & 0x80); return value }

export function parseMidi(buffer: ArrayBuffer, name = 'MIDI') : MidiProject {
  const view = new DataView(buffer); if (view.getUint32(0) !== 0x4d546864) throw new Error('不是有效的MIDI文件')
  const headerLength = view.getUint32(4), tracks = view.getUint16(10), division = view.getUint16(12); if (division & 0x8000) throw new Error('暂不支持SMPTE时间格式MIDI')
  let offset = 8 + headerLength; const events: RawEvent[] = [], tempos: Tempo[] = [{ tick: 0, microseconds: 500000 }]
  for (let trackIndex = 0; trackIndex < tracks; trackIndex++) {
    if (view.getUint32(offset) !== 0x4d54726b) throw new Error('MIDI轨道数据损坏'); const length = view.getUint32(offset + 4), end = offset + 8 + length, position = { value: offset + 8 }; let tick = 0, running = 0
    while (position.value < end) {
      tick += readVar(view, position); let status = view.getUint8(position.value)
      if (status < 0x80) { if (!running) throw new Error('MIDI运行状态无效'); status = running } else { position.value++; if (status < 0xf0) running = status }
      if (status === 0xff) { const type = view.getUint8(position.value++), size = readVar(view, position); if (type === 0x51 && size === 3) tempos.push({ tick, microseconds: view.getUint8(position.value) << 16 | view.getUint8(position.value + 1) << 8 | view.getUint8(position.value + 2) }); position.value += size; continue }
      if (status === 0xf0 || status === 0xf7) { position.value += readVar(view, position); continue }
      const command = status & 0xf0, channel = status & 0x0f, first = view.getUint8(position.value++), twoBytes = command !== 0xc0 && command !== 0xd0, second = twoBytes ? view.getUint8(position.value++) : 0
      if (command === 0x90) events.push({ tick, type: second ? 'on' : 'off', pitch: first, velocity: second, channel }); else if (command === 0x80) events.push({ tick, type: 'off', pitch: first, velocity: second, channel })
    }
    offset = end
  }
  const tempoMap = [...tempos].sort((a, b) => a.tick - b.tick).filter((tempo, index, items) => !index || tempo.tick !== items[index - 1].tick)
  const secondsAt = (tick: number) => { let seconds = 0, previousTick = 0, microseconds = tempoMap[0].microseconds; for (const tempo of tempoMap.slice(1)) { if (tempo.tick >= tick) break; seconds += (tempo.tick - previousTick) / division * microseconds / 1e6; previousTick = tempo.tick; microseconds = tempo.microseconds } return seconds + (tick - previousTick) / division * microseconds / 1e6 }
  const active = new Map<string, RawEvent[]>(), notes: MidiNote[] = []
  for (const event of events.sort((a, b) => a.tick - b.tick)) { const key = `${event.channel}:${event.pitch}`; if (event.type === 'on') active.set(key, [...(active.get(key) || []), event]); else { const queue = active.get(key), start = queue?.shift(); if (!start) continue; const startSeconds = secondsAt(start.tick), endSeconds = secondsAt(event.tick); notes.push({ id: `midi-${notes.length + 1}`, pitch: start.pitch, start: startSeconds, duration: Math.max(.03, endSeconds - startSeconds), velocity: start.velocity / 127, channel: start.channel }) } }
  const duration = Math.max(0, ...notes.map(note => note.start + note.duration)); return { name, duration, bpm: Math.round(60000000 / tempoMap[0].microseconds), notes }
}

export async function renderMidi(project: MidiProject, instrument: OscillatorType = 'triangle', transpose = 0, sampleRate = 44100) {
  const duration = Math.max(.1, project.duration + .4), context = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate), master = context.createGain(); master.gain.value = .65; master.connect(context.destination)
  for (const note of project.notes) { const oscillator = context.createOscillator(), gain = context.createGain(), pitch = Math.max(0, Math.min(127, note.pitch + transpose)), start = note.start, end = start + note.duration; oscillator.type = note.channel === 9 ? 'square' : instrument; oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12); gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(Math.max(.02, note.velocity * .22), start + .008); gain.gain.setValueAtTime(Math.max(.015, note.velocity * .18), Math.max(start + .009, end - .05)); gain.gain.exponentialRampToValueAtTime(.0001, end + .08); oscillator.connect(gain).connect(master); oscillator.start(start); oscillator.stop(end + .1) }
  return context.startRendering()
}
