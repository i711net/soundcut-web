import { useEffect, useRef, useState } from 'react'
import { Download, Upload, MousePointer2, Scissors, Waves, Undo2, Redo2, Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, Music2, Trash2, LockKeyhole, RotateCcw, SlidersHorizontal, FileText, Video } from 'lucide-react'
import Waveform from './Waveform'
import { bufferToWav, formatTime, removeRange, renderBuffer, type EditSettings } from './audio'
import TranscriptPanel from './TranscriptPanel'
import { mergeTranscriptSegments, parseVtt, type TranscriptSegment } from './transcript'
import { convertWav, extractAudioFromVideo, type AudioExportFormat } from './media'

type Snapshot = { buffer: AudioBuffer; selection: [number, number] }

export default function App() {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [fileName, setFileName] = useState('未命名项目')
  const [selection, setSelection] = useState<[number, number]>([0, 0])
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [settings, setSettings] = useState<EditSettings>({ start: 0, end: 0, gain: 1, fadeIn: 0, fadeOut: 0 })
  const [speed, setSpeed] = useState(1)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [status, setStatus] = useState('准备就绪')
  const [inspectorTab, setInspectorTab] = useState<'properties' | 'transcript'>('properties')
  const [language, setLanguage] = useState('auto')
  const [contentMode, setContentMode] = useState<'speech' | 'song'>('speech')
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([])
  const [transcribing, setTranscribing] = useState(false)
  const [transcriptionProgress, setTranscriptionProgress] = useState(0)
  const [transcriptionError, setTranscriptionError] = useState('')
  const [exportFormat, setExportFormat] = useState<AudioExportFormat>('wav')
  const [mediaWorking, setMediaWorking] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const audioContext = useRef<AudioContext | null>(null), source = useRef<AudioBufferSourceNode | null>(null), startedAt = useRef(0), offset = useRef(0), frame = useRef(0)
  const videoElement = useRef<HTMLVideoElement | null>(null), videoObjectUrl = useRef('')
  const currentTimeRef = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => () => { source.current?.stop(); cancelAnimationFrame(frame.current); audioContext.current?.close(); if (videoObjectUrl.current) URL.revokeObjectURL(videoObjectUrl.current) }, [])
  useEffect(() => { if (videoElement.current) videoElement.current.playbackRate = speed }, [speed])
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])

  const loadFile = async (file?: File) => {
    if (!file) return
    try {
      const isVideo = file.type.startsWith('video/')
      if (videoObjectUrl.current) URL.revokeObjectURL(videoObjectUrl.current)
      videoObjectUrl.current = isVideo ? URL.createObjectURL(file) : ''
      setVideoUrl(videoObjectUrl.current)
      setMediaWorking(isVideo); setStatus(isVideo ? '正在加载 FFmpeg 并提取视频音轨…' : '正在解析音频…')
      const ctx = audioContext.current ?? new AudioContext(); audioContext.current = ctx
      const sourceData = isVideo ? await (await extractAudioFromVideo(file)).arrayBuffer() : await file.arrayBuffer()
      const decoded = await ctx.decodeAudioData(sourceData)
      setBuffer(decoded); setFileName(file.name.replace(/\.[^.]+$/, '')); setSelection([0, decoded.duration]); setSettings(s => ({ ...s, start: 0, end: decoded.duration })); setCurrentTime(0); setHistory([]); setFuture([]); setTranscript([]); setTranscriptionError(''); setStatus('音频已在本机载入')
    } catch { setStatus('无法读取媒体文件，可能是不支持的编码或文件过大') }
    finally { setMediaWorking(false) }
  }

  const stop = (keepTime = true) => {
    if (source.current) { try { source.current.stop() } catch { /* already stopped */ } source.current = null }
    cancelAnimationFrame(frame.current); videoElement.current?.pause(); setPlaying(false); if (!keepTime) { setCurrentTime(0); if (videoElement.current) videoElement.current.currentTime = 0 }
  }
  const play = async () => {
    if (!buffer) return input.current?.click()
    if (playing) return stop()
    const ctx = audioContext.current ?? new AudioContext(); audioContext.current = ctx; await ctx.resume()
    const node = ctx.createBufferSource(), gain = ctx.createGain(); node.buffer = buffer; node.playbackRate.value = speed; gain.gain.value = settings.gain; node.connect(gain).connect(ctx.destination)
    const from = currentTimeRef.current >= buffer.duration ? 0 : currentTimeRef.current; offset.current = from; startedAt.current = ctx.currentTime; source.current = node; node.start(0, from); setPlaying(true)
    if (videoElement.current) { videoElement.current.currentTime = from; videoElement.current.playbackRate = speed; void videoElement.current.play().catch(() => undefined) }
    const tick = () => { const next = offset.current + (ctx.currentTime - startedAt.current) * speed; setCurrentTime(Math.min(next, buffer.duration)); if (next < buffer.duration && source.current) frame.current = requestAnimationFrame(tick) }
    frame.current = requestAnimationFrame(tick); node.onended = () => { source.current = null; cancelAnimationFrame(frame.current); videoElement.current?.pause(); setPlaying(false) }
  }
  const seek = (time: number) => { const wasPlaying = playing; stop(); currentTimeRef.current = time; setCurrentTime(time); if (videoElement.current) videoElement.current.currentTime = time; if (wasPlaying) setTimeout(play, 0) }
  const remember = () => { if (buffer) { setHistory(h => [...h.slice(-19), { buffer, selection }]); setFuture([]) } }
  const keepSelection = () => { if (!buffer || selection[1] - selection[0] < .02) return; remember(); const next = renderBuffer(buffer, { ...settings, start: selection[0], end: selection[1], gain: 1, fadeIn: 0, fadeOut: 0 }); stop(false); setBuffer(next); setSelection([0, next.duration]); setSettings(s => ({ ...s, start: 0, end: next.duration })); setStatus('已保留选区') }
  const deleteSelection = () => { if (!buffer || selection[1] - selection[0] < .02 || selection[1] - selection[0] >= buffer.duration) return; remember(); const next = removeRange(buffer, ...selection); stop(false); setBuffer(next); setSelection([0, next.duration]); setSettings(s => ({ ...s, end: next.duration })); setStatus('已删除选区') }
  const undo = () => { const last = history.at(-1); if (!last || !buffer) return; stop(false); setFuture(f => [{ buffer, selection }, ...f]); setBuffer(last.buffer); setSelection(last.selection); setHistory(h => h.slice(0, -1)); setSettings(s => ({ ...s, end: last.buffer.duration })) }
  const redo = () => { const next = future[0]; if (!next || !buffer) return; stop(false); setHistory(h => [...h, { buffer, selection }]); setBuffer(next.buffer); setSelection(next.selection); setFuture(f => f.slice(1)); setSettings(s => ({ ...s, end: next.buffer.duration })) }
  const exportAudio = async () => {
    if (!buffer) return input.current?.click()
    try {
      setMediaWorking(true); setStatus(exportFormat === 'wav' ? '正在生成 WAV…' : `正在加载 FFmpeg 并编码 ${exportFormat.toUpperCase()}…`)
      const rendered = renderBuffer(buffer, { ...settings, start: 0, end: buffer.duration }), wav = bufferToWav(rendered)
      const blob = exportFormat === 'wav' ? wav : await convertWav(wav, exportFormat)
      const url = URL.createObjectURL(blob), anchor = document.createElement('a')
      anchor.href = url; anchor.download = `${fileName || 'soundcut'}.${exportFormat}`; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus(`${exportFormat.toUpperCase()} 已导出`)
    } catch { setStatus('格式转换失败，请尝试 WAV 或更短的媒体文件') }
    finally { setMediaWorking(false) }
  }

  const transcribe = async () => {
    if (!buffer || transcribing) return
    setTranscribing(true); setTranscriptionError(''); setTranscript([]); setInspectorTab('transcript'); setStatus('正在进行云端文字识别…')
    const chunkSeconds = contentMode === 'song' ? 30 : 120, chunkCount = Math.ceil(buffer.duration / chunkSeconds), merged: TranscriptSegment[] = []
    try {
      for (let index = 0; index < chunkCount; index++) {
        const start = index * chunkSeconds, end = Math.min(buffer.duration, start + chunkSeconds)
        const chunk = renderBuffer(buffer, { start, end, gain: settings.gain, fadeIn: 0, fadeOut: 0 })
        const response = await fetch(`/api/transcribe?language=${encodeURIComponent(language)}&mode=${contentMode}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: bufferToWav(chunk) })
        const contentType = response.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
          throw new Error(response.status === 404 || contentType.includes('text/html')
            ? 'AI 接口未部署：请确认 GitHub 包含 functions/api/transcribe.js，并在 Cloudflare 重新部署'
            : `识别接口返回了无法读取的内容（HTTP ${response.status}）`)
        }
        const data = await response.json() as { error?: string; text?: string; vtt?: string; segments?: Array<{ start?: number; end?: number; text?: string }> }
        if (!response.ok) throw new Error(data.error || `识别服务返回 ${response.status}`)
        let chunkSegments = data.vtt ? parseVtt(data.vtt, start) : (data.segments || []).filter(item => item.text).map((item, i) => ({ id: i, start: (item.start || 0) + start, end: (item.end || end - start) + start, text: item.text || '' }))
        if (!chunkSegments.length && data.text?.trim()) chunkSegments = [{ id: 0, start, end, text: data.text.trim() }]
        merged.push(...chunkSegments); setTranscript(mergeTranscriptSegments(merged, language, contentMode)); setTranscriptionProgress(Math.round((index + 1) / chunkCount * 100))
      }
      const normalized = mergeTranscriptSegments(merged, language, contentMode)
      setTranscript(normalized); setStatus(`识别完成，共 ${normalized.length} 行文字`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '识别失败，请稍后重试'
      setTranscriptionError(message); setStatus(message)
    } finally { setTranscribing(false) }
  }

  const Tool = ({ icon, label, action, disabled = false }: { icon: React.ReactNode; label: string; action?: () => void; disabled?: boolean }) => <button className="tool" onClick={action} disabled={disabled}>{icon}<span>{label}</span></button>
  return <div className="app" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); loadFile(e.dataTransfer.files[0]) }}>
    <header><div className="brand"><span className="brand-mark"><i/><i/><i/><i/><i/></span><b>声刻</b><span>SoundCut</span></div><div className="project">{fileName}</div><div className="header-actions"><button aria-label="撤销" onClick={undo} disabled={!history.length}><Undo2/></button><button aria-label="重做" onClick={redo} disabled={!future.length}><Redo2/></button><button className="export" onClick={exportAudio} disabled={mediaWorking}><Download/> {mediaWorking ? '处理中' : '导出'}</button></div></header>
    <main>
      <aside className="tools"><button className="import" onClick={() => input.current?.click()}><Upload/>导入媒体</button><input ref={input} type="file" accept="audio/*,video/*" hidden onChange={e => loadFile(e.target.files?.[0])}/><Tool icon={<MousePointer2/>} label="选择"/><Tool icon={<Scissors/>} label="保留选区" action={keepSelection} disabled={!buffer}/><Tool icon={<Trash2/>} label="删除选区" action={deleteSelection} disabled={!buffer}/><Tool icon={<Waves/>} label="淡入 / 淡出"/><div className="tool-spacer"/><Tool icon={<Undo2/>} label="撤销" action={undo} disabled={!history.length}/><Tool icon={<Redo2/>} label="重做" action={redo} disabled={!future.length}/></aside>
      <section className="workspace">
        <div className="ruler">{Array.from({length: 9}, (_, i) => <span key={i}>{formatTime((buffer?.duration ?? 120) * i / 8)}</span>)}</div>
        <div className="track"><div className="track-meta"><span>1</span><strong>主音轨</strong><small>{buffer ? `${videoUrl ? '已从视频提取 · ' : ''}${buffer.numberOfChannels === 1 ? '单声道' : '立体声'} · ${buffer.sampleRate} Hz` : '等待导入'}</small></div><div className="track-canvas">{buffer ? <Waveform buffer={buffer} selection={selection} currentTime={currentTime} onSelection={setSelection} onSeek={seek}/> : <button className="empty" onClick={() => input.current?.click()}><Upload/><strong>导入音频或视频，开始创作</strong><span>视频声音会自动提取到主音轨</span></button>}</div></div>
        <div className={`track video-track ${videoUrl ? 'has-media' : ''}`}><div className="track-meta"><span>2</span><strong>视频轨</strong><small>{videoUrl ? '画面与主音轨同步' : '可放置视频素材'}</small></div><div className="track-canvas video-timeline">{videoUrl ? <><video ref={videoElement} src={videoUrl} muted playsInline preload="metadata"/><div className="video-clip"><Video/><div><strong>{fileName}</strong><span>声音已提取至音轨 1</span></div></div></> : <button className="video-empty" onClick={() => input.current?.click()}><Video/><span>拖入 MP4、WebM、MOV 视频</span></button>}</div></div>
        <div className="track secondary"><div className="track-meta"><span>3</span><strong>背景音乐</strong><small>下一版本</small></div><div className="track-canvas placeholder"><Music2/><span>多轨混音即将加入</span></div></div>
        <div className="privacy"><LockKeyhole/> 默认本地处理；仅开启 AI 识别时上传临时片段</div>
      </section>
      <aside className="inspector">
        <div className="inspector-tabs">
          <button className={inspectorTab === 'properties' ? 'active' : ''} onClick={() => setInspectorTab('properties')}><SlidersHorizontal/>属性</button>
          <button className={inspectorTab === 'transcript' ? 'active' : ''} onClick={() => setInspectorTab('transcript')}><FileText/>文字{transcript.length > 0 && <i>{transcript.length}</i>}</button>
        </div>
        {inspectorTab === 'properties' ? <div className="properties-panel">
          <label>音频名称<input value={fileName} onChange={e => setFileName(e.target.value)}/></label>
          <div className="info-row"><span>时长</span><b>{formatTime(buffer?.duration ?? 0, true)}</b></div><hr/>
          <label>音量 <output>{Math.round(settings.gain * 100)}%</output><input type="range" min="0" max="2" step=".01" value={settings.gain} onChange={e => setSettings({...settings, gain: +e.target.value})}/></label>
          <label>淡入 <output>{settings.fadeIn.toFixed(1)}s</output><input type="range" min="0" max="10" step=".1" value={settings.fadeIn} onChange={e => setSettings({...settings, fadeIn: +e.target.value})}/></label>
          <label>淡出 <output>{settings.fadeOut.toFixed(1)}s</output><input type="range" min="0" max="10" step=".1" value={settings.fadeOut} onChange={e => setSettings({...settings, fadeOut: +e.target.value})}/></label>
          <label>播放速度 <output>{speed.toFixed(2)}×</output><input type="range" min=".5" max="2" step=".05" value={speed} onChange={e => setSpeed(+e.target.value)}/></label><hr/>
          <label>导出格式<select value={exportFormat} onChange={e => setExportFormat(e.target.value as AudioExportFormat)}><option value="wav">WAV · 16 bit</option><option value="mp3">MP3 · 192 kbps</option><option value="m4a">M4A / AAC · 192 kbps</option><option value="flac">FLAC · 无损</option><option value="ogg">OGG Vorbis</option></select></label>
          <div className="selection-info"><span>当前选区</span><b>{formatTime(selection[0], true)} — {formatTime(selection[1], true)}</b></div>
        </div> : <TranscriptPanel fileName={fileName} hasAudio={!!buffer} language={language} onLanguage={setLanguage} contentMode={contentMode} onContentMode={setContentMode} segments={transcript} onSegments={setTranscript} onSeek={seek} onTranscribe={transcribe} progress={transcriptionProgress} working={transcribing} error={transcriptionError}/>} 
      </aside>
    </main>
    <footer><div className="time"><strong>{formatTime(currentTime, true)}</strong><span>/ {formatTime(buffer?.duration ?? 0, true)}</span></div><div className="transport"><button onClick={() => seek(Math.max(0, currentTime - 5))}><SkipBack/></button><button className="play" onClick={play}>{playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button><button onClick={() => seek(Math.min(buffer?.duration ?? 0, currentTime + 5))}><SkipForward/></button></div><div className="zoom"><ZoomOut/><input type="range" defaultValue="60"/><ZoomIn/></div><div className="status"><RotateCcw/>{status}</div></footer>
  </div>
}
