export type TranscriptSegment = { id: number; start: number; end: number; text: string }

const timestampToSeconds = (value: string) => {
  const parts = value.trim().replace(',', '.').split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return parts[0] * 60 + parts[1]
}

export function parseVtt(vtt: string, offset = 0): TranscriptSegment[] {
  const lines = vtt.replace(/\r/g, '').split('\n')
  const result: TranscriptSegment[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('-->')) continue
    const [from, to] = lines[i].split('-->').map(value => value.trim().split(' ')[0])
    const text: string[] = []
    while (++i < lines.length && lines[i].trim()) text.push(lines[i].trim())
    const clean = text.join(' ').replace(/<[^>]+>/g, '').trim()
    if (clean) result.push({ id: result.length, start: timestampToSeconds(from) + offset, end: timestampToSeconds(to) + offset, text: clean })
  }
  return result
}

export function mergeTranscriptSegments(segments: TranscriptSegment[], language: string, mode: 'speech' | 'song') {
  if (mode !== 'song' || segments.length < 2) return segments.map((item, id) => ({ ...item, id }))
  const compactLanguage = ['zh', 'yue', 'ja', 'ko'].includes(language)
  const maxLength = compactLanguage ? 24 : 90
  const result: TranscriptSegment[] = []
  for (const source of segments) {
    const text = compactLanguage ? source.text.replace(/\s+/g, '') : source.text.trim()
    if (!text) continue
    const previous = result.at(-1)
    const gap = previous ? source.start - previous.end : Infinity
    const combinedLength = (previous?.text.length || 0) + text.length
    const combinedDuration = previous ? source.end - previous.start : Infinity
    const previousFinished = previous ? /[。！？!?；;]$/.test(previous.text) : true
    if (previous && gap <= 1 && combinedDuration <= 9 && combinedLength <= maxLength && !previousFinished) {
      previous.end = source.end
      previous.text += compactLanguage || /[\s'’\-]$/.test(previous.text) ? text : ` ${text}`
    } else {
      result.push({ ...source, id: result.length, text })
    }
  }
  return result
}

const srtTime = (seconds: number) => {
  const ms = Math.floor((seconds % 1) * 1000), total = Math.floor(seconds)
  const s = total % 60, m = Math.floor(total / 60) % 60, h = Math.floor(total / 3600)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

const vttTime = (seconds: number) => srtTime(seconds).replace(',', '.')

export function transcriptFile(segments: TranscriptSegment[], format: 'txt' | 'srt' | 'vtt' | 'lrc') {
  if (format === 'txt') return segments.map(item => item.text).join('\n')
  if (format === 'lrc') return segments.map(item => {
    const minutes = Math.floor(item.start / 60), seconds = item.start % 60
    return `[${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}]${item.text}`
  }).join('\n') + '\n'
  const cues = segments.map((item, index) => `${format === 'srt' ? `${index + 1}\n` : ''}${(format === 'srt' ? srtTime : vttTime)(item.start)} --> ${(format === 'srt' ? srtTime : vttTime)(item.end)}\n${item.text}`).join('\n\n')
  return format === 'vtt' ? `WEBVTT\n\n${cues}\n` : `${cues}\n`
}

export function downloadTranscript(name: string, segments: TranscriptSegment[], format: 'txt' | 'srt' | 'vtt' | 'lrc') {
  const blob = new Blob([transcriptFile(segments, format)], { type: format === 'txt' ? 'text/plain;charset=utf-8' : 'text/vtt;charset=utf-8' })
  const url = URL.createObjectURL(blob), anchor = document.createElement('a')
  anchor.href = url; anchor.download = `${name || 'soundcut'}.${format}`; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
