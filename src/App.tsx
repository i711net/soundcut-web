import { useEffect, useRef, useState } from 'react'
import { Download, Upload, MousePointer2, Scissors, Waves, Undo2, Redo2, Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, Music2, Trash2, LockKeyhole, RotateCcw, SlidersHorizontal, FileText, Video, Plus, CopyPlus, Headphones, Mic, Square, MonitorUp } from 'lucide-react'
import Waveform from './Waveform'
import { bufferToWav, formatTime, removeRange, renderBuffer, type EditSettings } from './audio'
import TranscriptPanel from './TranscriptPanel'
import { mergeTranscriptSegments, parseVtt, type TranscriptSegment } from './transcript'
import { convertWav, extractAudioFromVideo, type AudioExportFormat } from './media'
import { useTrackStore } from './useTrackStore'
import TrackControls from './TrackControls'
import ClipControls from './ClipControls'
import { useMixerPlayback } from './useMixerPlayback'
import { mixTracks } from './mixer'

type Snapshot = { buffer: AudioBuffer; selection: [number, number] }

export default function App() {
  const trackStore = useTrackStore()
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [fileName, setFileName] = useState('未命名项目')
  const [selection, setSelection] = useState<[number, number]>([0, 0])
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [settings, setSettings] = useState<EditSettings>({ start: 0, end: 0, gain: 1, fadeIn: 0, fadeOut: 0 })
  const [speed, setSpeed] = useState(1)
  const [masterVolume, setMasterVolume] = useState(1)
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
  const [streamUrlInput, setStreamUrlInput] = useState('')
  const [streamSourceUrl, setStreamSourceUrl] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [screenRecording, setScreenRecording] = useState(false)
  const [screenRecordingSeconds, setScreenRecordingSeconds] = useState(0)
  const [captureSize, setCaptureSize] = useState<'source' | '720' | '1080'>('1080')
  const audioContext = useRef<AudioContext | null>(null), source = useRef<AudioBufferSourceNode | null>(null), startedAt = useRef(0), offset = useRef(0), frame = useRef(0)
  const videoElement = useRef<HTMLVideoElement | null>(null), videoObjectUrl = useRef('')
  const currentTimeRef = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const recorder = useRef<MediaRecorder | null>(null), recorderStream = useRef<MediaStream | null>(null), recordingChunks = useRef<Blob[]>([]), recordingTimer = useRef(0)
  const screenRecorder = useRef<MediaRecorder | null>(null), screenStream = useRef<MediaStream | null>(null), screenChunks = useRef<Blob[]>([]), screenTimer = useRef(0)
  const importTarget = useRef('track-1')
  const mixerPlayback = useMixerPlayback(trackStore.tracks, speed, masterVolume, time => { currentTimeRef.current = time; setCurrentTime(time) })
  const timelineDuration = mixerPlayback.duration || 120
  const playheadPercent = Math.min(100, Math.max(0, currentTime / timelineDuration * 100))
  const playheadPosition = `calc(${playheadPercent}% + ${120 * (1 - playheadPercent / 100)}px)`

  useEffect(() => () => { source.current?.stop(); cancelAnimationFrame(frame.current); clearInterval(recordingTimer.current); clearInterval(screenTimer.current); recorderStream.current?.getTracks().forEach(track => track.stop()); screenStream.current?.getTracks().forEach(track => track.stop()); audioContext.current?.close(); if (videoObjectUrl.current) URL.revokeObjectURL(videoObjectUrl.current) }, [])
  useEffect(() => { if (videoElement.current) videoElement.current.playbackRate = speed * trackStore.tracks[1].playbackRate * trackStore.tracks[1].clipPlaybackRate }, [speed, trackStore.tracks])
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { trackStore.setTrackBuffer('track-1', buffer) }, [buffer, trackStore.setTrackBuffer])

  const loadFile = async (file?: File) => {
    if (!file) return
    try {
      const isVideo = file.type.startsWith('video/')
      if (videoObjectUrl.current) URL.revokeObjectURL(videoObjectUrl.current)
      videoObjectUrl.current = isVideo ? URL.createObjectURL(file) : ''
      setStreamSourceUrl('')
      setVideoUrl(videoObjectUrl.current)
      setMediaWorking(isVideo); setStatus(isVideo ? '正在加载 FFmpeg 并提取视频音轨…' : '正在解析音频…')
      const ctx = audioContext.current ?? new AudioContext(); audioContext.current = ctx
      const sourceData = isVideo ? await (await extractAudioFromVideo(file)).arrayBuffer() : await file.arrayBuffer()
      const decoded = await ctx.decodeAudioData(sourceData)
      if (isVideo || importTarget.current === 'video-1') { trackStore.setTrackBuffer('video-1', decoded, `${file.name.replace(/\.[^.]+$/, '')} · 原声`); trackStore.setActiveId('video-1') }
      else if (importTarget.current === 'track-1') { setBuffer(decoded); trackStore.setActiveId('track-1') }
      else { trackStore.setTrackBuffer(importTarget.current, decoded, file.name.replace(/\.[^.]+$/, '')); trackStore.setActiveId(importTarget.current) }
      setFileName(file.name.replace(/\.[^.]+$/, '')); setSelection([0, decoded.duration]); setSettings(s => ({ ...s, start: 0, end: decoded.duration })); setCurrentTime(0); setHistory([]); setFuture([]); setTranscript([]); setTranscriptionError(''); setStatus(isVideo ? '视频与原声已载入视频轨' : '音频已载入所选轨道')
    } catch { setStatus('无法读取媒体文件，可能是不支持的编码或文件过大') }
    finally { setMediaWorking(false) }
  }
  const requestImport = (target: string) => { importTarget.current = target === 'main' ? 'track-1' : target === 'music' ? 'track-3' : target; input.current?.click() }
  const addAudioTrack = () => { const id = trackStore.addTrack(); requestImport(id) }
  const openStream = () => {
    try {
      const url = new URL(streamUrlInput)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
      if (videoObjectUrl.current) { URL.revokeObjectURL(videoObjectUrl.current); videoObjectUrl.current = '' }
      setVideoUrl(url.href); setStreamSourceUrl(url.href); setFileName(url.pathname.split('/').pop()?.replace(/\.[^.]+$/, '') || '网络媒体'); setStatus('网络媒体已载入监看区')
    } catch { setStatus('请输入有效的 HTTP/HTTPS 媒体直链') }
  }
  const extractStreamAudio = async () => {
    if (!streamSourceUrl) return
    try {
      setMediaWorking(true); setStatus('正在读取网络媒体并提取原声…')
      const response = await fetch(streamSourceUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob(), type = response.headers.get('content-type') || blob.type || 'video/mp4'
      if (type.includes('mpegurl') || streamSourceUrl.toLowerCase().includes('.m3u8')) throw new Error('HLS 分段流暂不支持直接合并提取')
      importTarget.current = 'video-1'
      await loadFile(new File([blob], streamSourceUrl.split('/').pop()?.split('?')[0] || 'stream.mp4', { type }))
    } catch (error) {
      setStatus(error instanceof Error && error.message.includes('HLS') ? error.message : '无法提取：源站可能禁止跨域读取或媒体受保护')
    } finally { setMediaWorking(false) }
  }
  const toggleRecording = async () => {
    if (recording) { recorder.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
      recorderStream.current = stream; recordingChunks.current = []
      const mediaRecorder = new MediaRecorder(stream); recorder.current = mediaRecorder
      mediaRecorder.ondataavailable = event => { if (event.data.size) recordingChunks.current.push(event.data) }
      mediaRecorder.onstop = async () => {
        clearInterval(recordingTimer.current); stream.getTracks().forEach(track => track.stop()); recorderStream.current = null; setRecording(false)
        try {
          const blob = new Blob(recordingChunks.current, { type: mediaRecorder.mimeType || 'audio/webm' })
          const ctx = audioContext.current ?? new AudioContext(); audioContext.current = ctx
          const decoded = await ctx.decodeAudioData(await blob.arrayBuffer()), name = `麦克风录音 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
          trackStore.addTrack(decoded, name); setFileName(name); setCurrentTime(0); setStatus('录音已加入新音轨')
        } catch { setStatus('无法解析本次录音，请更换浏览器后重试') }
      }
      mediaRecorder.start(250); setRecordingSeconds(0); setRecording(true); setStatus('正在录音…')
      recordingTimer.current = window.setInterval(() => setRecordingSeconds(value => value + 1), 1000)
    } catch { setStatus('无法使用麦克风：请允许浏览器麦克风权限') }
  }
  const toggleScreenRecording = async () => {
    if (screenRecording) { screenRecorder.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: true })
      const videoTrack = stream.getVideoTracks()[0]
      if (captureSize !== 'source' && videoTrack) {
        const size = captureSize === '720' ? { width: 1280, height: 720 } : { width: 1920, height: 1080 }
        await videoTrack.applyConstraints({ width: { ideal: size.width }, height: { ideal: size.height } }).catch(() => undefined)
      }
      screenStream.current = stream; screenChunks.current = []
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm'
      const mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: captureSize === '720' ? 4_000_000 : 8_000_000 })
      screenRecorder.current = mediaRecorder
      mediaRecorder.ondataavailable = event => { if (event.data.size) screenChunks.current.push(event.data) }
      mediaRecorder.onstop = async () => {
        clearInterval(screenTimer.current); stream.getTracks().forEach(track => track.stop()); screenStream.current = null; setScreenRecording(false)
        const blob = new Blob(screenChunks.current, { type: mediaRecorder.mimeType || 'video/webm' })
        if (!blob.size) { setStatus('屏幕录制没有生成内容'); return }
        const name = `屏幕录制-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.webm`
        importTarget.current = 'video-1'; await loadFile(new File([blob], name, { type: 'video/webm' }))
        setStatus('屏幕录制已进入视频监看区，原声已加入视频轨')
      }
      videoTrack?.addEventListener('ended', () => { if (mediaRecorder.state === 'recording') mediaRecorder.stop() }, { once: true })
      mediaRecorder.start(500); setScreenRecordingSeconds(0); setScreenRecording(true); setStatus('正在录制屏幕；系统声音取决于共享弹窗中的音频选项')
      screenTimer.current = window.setInterval(() => setScreenRecordingSeconds(value => value + 1), 1000)
    } catch { setStatus('屏幕录制已取消，或浏览器未授予屏幕共享权限') }
  }
  const extractVideoToMain = () => {
    const videoBuffer = trackStore.tracks.find(track => track.id === 'video-1')?.buffer
    if (!videoBuffer) return
    setBuffer(videoBuffer); setSelection([0, videoBuffer.duration]); setSettings(value => ({ ...value, start: 0, end: videoBuffer.duration }))
    trackStore.extractVideoToMain(); trackStore.setActiveId('track-1'); setStatus('视频原声已提取到主音轨')
  }
  const isolateVideoAudio = () => {
    const videoTrack = trackStore.tracks.find(track => track.id === 'video-1')
    if (!videoTrack?.buffer) return
    trackStore.updateTrack('video-1', { muted: false, solo: !videoTrack.solo })
    trackStore.setActiveId('video-1'); setStatus(videoTrack.solo ? '已取消隔离视频原声' : '已隔离视频原声，仅播放本轨道')
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
  const seek = (time: number) => { const wasPlaying = mixerPlayback.playing; mixerPlayback.stop(); stop(); currentTimeRef.current = time; setCurrentTime(time); if (videoElement.current) videoElement.current.currentTime = time; if (wasPlaying) void mixerPlayback.playFrom(time) }
  const toggleMixerPlayback = async () => {
    if (mixerPlayback.playing) { mixerPlayback.stop(); videoElement.current?.pause(); return }
    await mixerPlayback.playFrom(currentTimeRef.current)
    if (videoElement.current) { videoElement.current.currentTime = currentTimeRef.current; videoElement.current.playbackRate = speed; void videoElement.current.play().catch(() => undefined) }
  }
  const remember = () => { if (buffer) { setHistory(h => [...h.slice(-19), { buffer, selection }]); setFuture([]) } }
  const keepSelection = () => { if (!buffer || selection[1] - selection[0] < .02) return; remember(); const next = renderBuffer(buffer, { ...settings, start: selection[0], end: selection[1], gain: 1, fadeIn: 0, fadeOut: 0 }); stop(false); setBuffer(next); setSelection([0, next.duration]); setSettings(s => ({ ...s, start: 0, end: next.duration })); setStatus('已保留选区') }
  const deleteSelection = () => { if (!buffer || selection[1] - selection[0] < .02 || selection[1] - selection[0] >= buffer.duration) return; remember(); const next = removeRange(buffer, ...selection); stop(false); setBuffer(next); setSelection([0, next.duration]); setSettings(s => ({ ...s, end: next.duration })); setStatus('已删除选区') }
  const undo = () => { const last = history.at(-1); if (!last || !buffer) return; stop(false); setFuture(f => [{ buffer, selection }, ...f]); setBuffer(last.buffer); setSelection(last.selection); setHistory(h => h.slice(0, -1)); setSettings(s => ({ ...s, end: last.buffer.duration })) }
  const redo = () => { const next = future[0]; if (!next || !buffer) return; stop(false); setHistory(h => [...h, { buffer, selection }]); setBuffer(next.buffer); setSelection(next.selection); setFuture(f => f.slice(1)); setSettings(s => ({ ...s, end: next.buffer.duration })) }
  const exportAudio = async () => {
    if (!trackStore.tracks.some(track => track.buffer && track.includeInExport)) return input.current?.click()
    try {
      setMediaWorking(true); setStatus(exportFormat === 'wav' ? '正在生成 WAV…' : `正在加载 FFmpeg 并编码 ${exportFormat.toUpperCase()}…`)
      const rendered = await mixTracks(trackStore.tracks, true, speed, masterVolume), wav = bufferToWav(rendered)
      const blob = exportFormat === 'wav' ? wav : await convertWav(wav, exportFormat)
      const url = URL.createObjectURL(blob), anchor = document.createElement('a')
      anchor.href = url; anchor.download = `${fileName || 'soundcut'}.${exportFormat}`; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus(`${exportFormat.toUpperCase()} 已导出`)
    } catch { setStatus('格式转换失败，请尝试 WAV 或更短的媒体文件') }
    finally { setMediaWorking(false) }
  }

  const transcribe = async () => {
    const targetBuffer = trackStore.activeTrack.buffer
    if (!targetBuffer || transcribing) return
    setTranscribing(true); setTranscriptionError(''); setTranscript([]); setInspectorTab('transcript'); setStatus('正在进行云端文字识别…')
    const chunkSeconds = contentMode === 'song' ? 30 : 120, chunkCount = Math.ceil(targetBuffer.duration / chunkSeconds), merged: TranscriptSegment[] = []
    try {
      for (let index = 0; index < chunkCount; index++) {
        const start = index * chunkSeconds, end = Math.min(targetBuffer.duration, start + chunkSeconds)
        const chunk = renderBuffer(targetBuffer, { start, end, gain: trackStore.activeTrack.volume, fadeIn: 0, fadeOut: 0 })
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
      <aside className="tools"><button className="import" onClick={() => requestImport('main')}><Upload/>导入媒体</button><input ref={input} type="file" accept="audio/*,video/*" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void loadFile(file) }}/><button className={`tool record-tool ${recording ? 'recording' : ''}`} onClick={toggleRecording}>{recording ? <Square fill="currentColor"/> : <Mic/>}<span>{recording ? `停止录音 ${formatTime(recordingSeconds)}` : '麦克风录音'}</span></button><div className="screen-record-config"><button className={`tool ${screenRecording ? 'recording' : ''}`} onClick={toggleScreenRecording}>{screenRecording ? <Square fill="currentColor"/> : <MonitorUp/>}<span>{screenRecording ? `停止录屏 ${formatTime(screenRecordingSeconds)}` : '录制屏幕'}</span></button><select value={captureSize} disabled={screenRecording} onChange={e => setCaptureSize(e.target.value as typeof captureSize)} aria-label="录屏清晰度"><option value="source">原始尺寸</option><option value="720">720p</option><option value="1080">1080p</option></select></div><Tool icon={<MousePointer2/>} label="选择"/><Tool icon={<Scissors/>} label="保留选区" action={keepSelection} disabled={!buffer}/><Tool icon={<Trash2/>} label="删除选区" action={deleteSelection} disabled={!buffer}/><Tool icon={<Waves/>} label="淡入 / 淡出"/><div className="tool-spacer"/><Tool icon={<Undo2/>} label="撤销" action={undo} disabled={!history.length}/><Tool icon={<Redo2/>} label="重做" action={redo} disabled={!future.length}/></aside>
      <section className="workspace">
        <div className="ruler">{Array.from({length: 9}, (_, i) => <span key={i}>{formatTime(timelineDuration * i / 8)}</span>)}</div>
        <div className="master-controls"><strong>总控</strong><label>速度<input type="range" min=".5" max="2" step=".05" value={speed} onChange={e => setSpeed(+e.target.value)}/><output>{speed.toFixed(2)}×</output></label><label>主音量<input type="range" min="0" max="2" step=".01" value={masterVolume} onChange={e => setMasterVolume(+e.target.value)}/><output>{Math.round(masterVolume * 100)}%</output></label></div>
        <div className="timeline-body">
        <div className="timeline-playhead" style={{ left: playheadPosition }}><span>{formatTime(currentTime, true)}</span></div>
        <div className={`track ${trackStore.tracks[0].expanded ? 'expanded' : ''}`}><TrackControls track={trackStore.tracks[0]} active={trackStore.activeId === 'track-1'} onActivate={() => trackStore.setActiveId('track-1')} onChange={patch => trackStore.updateTrack('track-1', patch)}/><div className="track-canvas">{buffer ? <><Waveform buffer={buffer} selection={selection} currentTime={currentTime} onSelection={setSelection} onSeek={seek}/><ClipControls track={trackStore.tracks[0]} onChange={patch => trackStore.updateTrack('track-1', patch)}/></> : <button className="empty" onClick={() => requestImport('main')}><Upload/><strong>导入音频，开始创作</strong><span>视频可从右侧监看区导入</span></button>}</div></div>
        <div className={`track video-audio-track ${trackStore.tracks[1].expanded ? 'expanded' : ''}`}><TrackControls track={trackStore.tracks[1]} active={trackStore.activeId === 'video-1'} onActivate={() => trackStore.setActiveId('video-1')} onChange={patch => trackStore.updateTrack('video-1', patch)} onExtract={trackStore.tracks[1].buffer ? extractVideoToMain : undefined}/><div className="track-canvas">{trackStore.tracks[1].buffer ? <><Waveform buffer={trackStore.tracks[1].buffer} selection={[0, trackStore.tracks[1].buffer.duration]} currentTime={currentTime} onSelection={() => undefined} onSeek={seek}/><ClipControls track={trackStore.tracks[1]} onChange={patch => trackStore.updateTrack('video-1', patch)}/></> : <button className="video-empty" onClick={() => requestImport('video-1')}><Video/><span>导入视频，原声显示在此轨</span></button>}</div></div>
        <div className={`track ${trackStore.tracks[2].expanded ? 'expanded' : ''}`}><TrackControls track={trackStore.tracks[2]} active={trackStore.activeId === 'track-3'} onActivate={() => trackStore.setActiveId('track-3')} onChange={patch => trackStore.updateTrack('track-3', patch)}/><div className="track-canvas">{trackStore.tracks[2].buffer ? <><Waveform buffer={trackStore.tracks[2].buffer} selection={[0, trackStore.tracks[2].buffer.duration]} currentTime={currentTime} onSelection={() => undefined} onSeek={seek}/><ClipControls track={trackStore.tracks[2]} onChange={patch => trackStore.updateTrack('track-3', patch)}/></> : <button className="video-empty" onClick={() => requestImport('music')}><Music2/><span>导入背景音乐</span></button>}</div></div>
        {trackStore.tracks.slice(3).map(track => <div className={`track extra-track ${track.expanded ? 'expanded' : ''}`} key={track.id}><TrackControls track={track} active={trackStore.activeId === track.id} onActivate={() => trackStore.setActiveId(track.id)} onChange={patch => trackStore.updateTrack(track.id, patch)} onDelete={() => trackStore.deleteTrack(track.id)}/><div className="track-canvas">{track.buffer ? <><Waveform buffer={track.buffer} selection={[0, track.buffer.duration]} currentTime={currentTime} onSelection={() => undefined} onSeek={seek}/><ClipControls track={track} onChange={patch => trackStore.updateTrack(track.id, patch)}/></> : <button className="video-empty" onClick={() => requestImport(track.id)}><Upload/><span>导入音频</span></button>}</div></div>)}
        <button className="add-audio-track" onClick={addAudioTrack}><Plus/>添加音频轨道</button>
        <div className="privacy"><LockKeyhole/> 默认本地处理；仅开启 AI 识别时上传临时片段</div>
        </div>
      </section>
      <aside className="inspector">
        <section className="video-monitor">
          <div className="video-monitor-title"><span><Video/>视频监看</span><time>{formatTime(currentTime, true)}</time></div>
          {videoUrl ? <video ref={videoElement} src={videoUrl} muted={!!trackStore.tracks[1].buffer} controls playsInline preload="metadata"/> : <button onClick={() => requestImport('video-1')}><Video/><span>导入视频</span><small>MP4 · WebM · MOV</small></button>}
          <div className="stream-input"><input type="url" value={streamUrlInput} onChange={e => setStreamUrlInput(e.target.value)} placeholder="粘贴 MP4 / WebM / HLS 媒体直链"/><button onClick={openStream}>播放</button></div>
          <div className="video-monitor-actions"><button onClick={streamSourceUrl ? extractStreamAudio : extractVideoToMain} disabled={streamSourceUrl ? mediaWorking : !trackStore.tracks[1].buffer}><CopyPlus/>{streamSourceUrl && !trackStore.tracks[1].buffer ? '提取网络原声' : '提取到主轨'}</button><button className={trackStore.tracks[1].solo ? 'active' : ''} onClick={isolateVideoAudio} disabled={!trackStore.tracks[1].buffer}><Headphones/>{trackStore.tracks[1].solo ? '取消隔离' : '隔离原声'}</button></div>
        </section>
        <div className="inspector-tabs">
          <button className={inspectorTab === 'properties' ? 'active' : ''} onClick={() => setInspectorTab('properties')}><SlidersHorizontal/>属性</button>
          <button className={inspectorTab === 'transcript' ? 'active' : ''} onClick={() => setInspectorTab('transcript')}><FileText/>文字{transcript.length > 0 && <i>{transcript.length}</i>}</button>
        </div>
        {inspectorTab === 'properties' ? <div className="properties-panel">
          <label>音频名称<input value={fileName} onChange={e => setFileName(e.target.value)}/></label>
          <div className="info-row"><span>时长</span><b>{formatTime(buffer?.duration ?? 0, true)}</b></div><hr/>
          <label>总控音量 <output>{Math.round(masterVolume * 100)}%</output><input type="range" min="0" max="2" step=".01" value={masterVolume} onChange={e => setMasterVolume(+e.target.value)}/></label>
          <label>淡入 <output>{settings.fadeIn.toFixed(1)}s</output><input type="range" min="0" max="10" step=".1" value={settings.fadeIn} onChange={e => setSettings({...settings, fadeIn: +e.target.value})}/></label>
          <label>淡出 <output>{settings.fadeOut.toFixed(1)}s</output><input type="range" min="0" max="10" step=".1" value={settings.fadeOut} onChange={e => setSettings({...settings, fadeOut: +e.target.value})}/></label>
          <label>播放速度 <output>{speed.toFixed(2)}×</output><input type="range" min=".5" max="2" step=".05" value={speed} onChange={e => setSpeed(+e.target.value)}/></label><hr/>
          <label>导出格式<select value={exportFormat} onChange={e => setExportFormat(e.target.value as AudioExportFormat)}><option value="wav">WAV · 16 bit</option><option value="mp3">MP3 · 192 kbps</option><option value="m4a">M4A / AAC · 192 kbps</option><option value="flac">FLAC · 无损</option><option value="ogg">OGG Vorbis</option></select></label>
          <div className="selection-info"><span>当前选区</span><b>{formatTime(selection[0], true)} — {formatTime(selection[1], true)}</b></div>
        </div> : <TranscriptPanel fileName={fileName} hasAudio={!!trackStore.activeTrack.buffer} language={language} onLanguage={setLanguage} contentMode={contentMode} onContentMode={setContentMode} segments={transcript} onSegments={setTranscript} onSeek={seek} onTranscribe={transcribe} progress={transcriptionProgress} working={transcribing} error={transcriptionError}/>} 
      </aside>
    </main>
    <footer><div className="time"><strong>{formatTime(currentTime, true)}</strong><span>/ {formatTime(mixerPlayback.duration, true)}</span></div><div className="transport"><button onClick={() => seek(Math.max(0, currentTime - 5))}><SkipBack/></button><button className="play" onClick={toggleMixerPlayback}>{mixerPlayback.playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button><button onClick={() => seek(Math.min(mixerPlayback.duration, currentTime + 5))}><SkipForward/></button></div><div className="zoom"><ZoomOut/><input type="range" defaultValue="60"/><ZoomIn/></div><div className="status"><RotateCcw/>{status}</div></footer>
  </div>
}
