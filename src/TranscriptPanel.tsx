import { Check, Cloud, Copy, Download, Languages, LoaderCircle, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { formatTime } from './audio'
import { downloadTranscript, type TranscriptSegment } from './transcript'

type Props = {
  fileName: string
  hasAudio: boolean
  language: string
  onLanguage: (value: string) => void
  contentMode: 'speech' | 'song'
  onContentMode: (value: 'speech' | 'song') => void
  segments: TranscriptSegment[]
  onSegments: (value: TranscriptSegment[]) => void
  onSeek: (time: number) => void
  onTranscribe: () => void
  progress: number
  working: boolean
  error: string
}

export default function TranscriptPanel(props: Props) {
  const { segments, working, progress } = props
  const [copied, setCopied] = useState(false)
  const copyLyrics = async () => {
    await navigator.clipboard.writeText(segments.map(item => item.text).join('\n'))
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  return <div className="transcript-panel">
    <div className="ai-intro"><Languages/><div><strong>多语言文字识别</strong><span>由 Cloudflare Workers AI 提供</span></div></div>
    <label>音频语言<select value={props.language} onChange={e => props.onLanguage(e.target.value)} disabled={working}>
      <option value="auto">自动检测</option><option value="zh">中文</option><option value="yue">粤语</option><option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option><option value="es">Español</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="pt">Português</option><option value="ru">Русский</option><option value="it">Italiano</option><option value="hi">हिन्दी</option>
    </select></label>
    <label>内容类型<select value={props.contentMode} onChange={e => props.onContentMode(e.target.value as 'speech' | 'song')} disabled={working}>
      <option value="speech">讲话 / 播客</option><option value="song">歌曲 / 歌词</option>
    </select></label>
    {props.contentMode === 'song' && props.language === 'auto' && <div className="language-hint">歌词建议手动选择语言，避免中文和英文来回跳变。</div>}
    <button className="transcribe-button" disabled={!props.hasAudio || working} onClick={props.onTranscribe}>{working ? <LoaderCircle className="spin"/> : <Sparkles/>}{working ? `正在识别 ${progress}%` : segments.length ? '重新识别' : '开始识别'}</button>
    <div className="cloud-notice"><Cloud/>仅点击开始后，音频片段会上传至 Cloudflare AI</div>
    {props.error && <div className="transcript-error">{props.error}</div>}
    {segments.length > 0 ? <>
      <div className="transcript-list">{segments.map((segment, index) => <div className="transcript-row" key={`${segment.start}-${index}`}>
        <button onClick={() => props.onSeek(segment.start)}>{formatTime(segment.start, true)}</button>
        <textarea aria-label={`${formatTime(segment.start)} 的识别文字`} value={segment.text} rows={Math.max(1, Math.ceil(segment.text.length / 20))} onChange={e => props.onSegments(segments.map((item, i) => i === index ? { ...item, text: e.target.value } : item))}/>
      </div>)}</div>
      <div className="transcript-downloads"><button className="copy-lyrics" onClick={copyLyrics}>{copied ? <Check/> : <Copy/>}{copied ? '已复制' : '复制歌词'}</button>{(['txt','lrc','srt','vtt'] as const).map(format => <button key={format} onClick={() => downloadTranscript(props.fileName, segments, format)}><Download/>{format.toUpperCase()}</button>)}</div>
    </> : !working && <div className="transcript-empty"><Sparkles/><strong>让声音变成可编辑文字</strong><span>识别后可点击时间码定位，并导出字幕。</span></div>}
  </div>
}
