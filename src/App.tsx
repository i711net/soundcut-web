import { useEffect, useRef, useState } from 'react'
import { Download, Upload, MousePointer2, Scissors, Waves, Undo2, Redo2, Play, Pause, SkipBack, SkipForward, Rewind, ZoomIn, ZoomOut, Music2, Trash2, LockKeyhole, RotateCcw, SlidersHorizontal, FileText, Video, Plus, CopyPlus, Headphones, Square, MonitorUp, UserRound, AudioLines } from 'lucide-react'
import { bufferToWav, extractChannel, formatTime, processChannels, renderBuffer, separateStereo, transformRange, type ChannelProcessOptions, type EditSettings } from './audio'
import TranscriptPanel from './TranscriptPanel'
import { mergeTranscriptSegments, parseVtt, type TranscriptSegment } from './transcript'
import { convertWav, extractAudioFromVideo, pitchShiftWav, type AudioExportFormat } from './media'
import { useTrackStore } from './useTrackStore'
import TrackControls from './TrackControls'
import ClipControls from './ClipControls'
import { useMixerPlayback } from './useMixerPlayback'
import { mixTracks, type MixerTrack } from './mixer'
import AudioEditToolbar from './AudioEditToolbar'
import TrackClipLane from './TrackClipLane'
import './tool-state.css'
import './central-voice-controls.css'
import './screen-preview.css'
import './draggable-playhead.css'
import './timeline-grid.css'
import './timeline-alignment.css'
import { presetPitch, type VoicePreset } from './voice-effects'
import ChannelEditor from './ChannelEditor'
import './channel-editor.css'
import PreciseRange from './PreciseRange'
import './precise-range.css'

type Snapshot = { tracks: MixerTrack[]; activeId: string; selection: [number, number] }

export default function App() {
  const trackStore = useTrackStore()
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [fileName, setFileName] = useState('未命名项目')
  const [selection, setSelection] = useState<[number, number]>([0, 0])
  const [timelineTool, setTimelineTool] = useState<'move' | 'select'>('move')
  const [effectScope, setEffectScope] = useState<'clip' | 'track'>('clip')
  const [pendingVoicePreset, setPendingVoicePreset] = useState<VoicePreset>('none')
  const [channelMix, setChannelMix] = useState({ leftGain: 1, rightGain: 1, pan: 0 })
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [settings, setSettings] = useState<EditSettings>({ start: 0, end: 0, gain: 1, fadeIn: 0, fadeOut: 0 })
  const [speed, setSpeed] = useState(1)
  const [masterVolume, setMasterVolume] = useState(1)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [audioClipboard, setAudioClipboard] = useState<AudioBuffer | null>(null)
  const [compactTracks, setCompactTracks] = useState(false)
  const [selectedClipId, setSelectedClipId] = useState('')
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
  const [screenRecording, setScreenRecording] = useState(false)
  const [screenRecordingSeconds, setScreenRecordingSeconds] = useState(0)
  const [screenPreviewPlaying, setScreenPreviewPlaying] = useState(false)
  const [screenStage, setScreenStage] = useState<'idle' | 'selecting' | 'ready' | 'recording' | 'finished' | 'error'>('idle')
  const [screenError, setScreenError] = useState('')
  const [screenRecordingUrl, setScreenRecordingUrl] = useState('')
  const [captureSize, setCaptureSize] = useState<'source' | '720' | '1080'>('1080')
  const [pitchWorkingId, setPitchWorkingId] = useState('')
  const audioContext = useRef<AudioContext | null>(null), source = useRef<AudioBufferSourceNode | null>(null), startedAt = useRef(0), offset = useRef(0), frame = useRef(0)
  const videoElement = useRef<HTMLVideoElement | null>(null), videoObjectUrl = useRef('')
  const currentTimeRef = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const fragmentInput = useRef<HTMLInputElement>(null)
  const timelineBodyRef = useRef<HTMLDivElement | null>(null), playheadDrag = useRef({ active: false, resume: false })
  const screenRecorder = useRef<MediaRecorder | null>(null), screenStream = useRef<MediaStream | null>(null), screenChunks = useRef<Blob[]>([]), screenTimer = useRef(0)
  const screenPreview = useRef<HTMLVideoElement | null>(null), screenRecordingBlob = useRef<Blob | null>(null), screenRecordingObjectUrl = useRef('')
  const importTarget = useRef('track-1')
  const preserveMainPitch = useRef<number | null>(null)
  const skipBufferSync = useRef(false)
  const resumeAfterPitch = useRef<{ trackId: string; semitones: number; time: number } | null>(null)
  const mixerPlayback = useMixerPlayback(trackStore.tracks, speed, masterVolume, time => { currentTimeRef.current = time; setCurrentTime(time) })
  const timelineDuration = Math.max(120, mixerPlayback.duration)
  const playheadPercent = Math.min(100, Math.max(0, currentTime / timelineDuration * 100))

  useEffect(() => () => { source.current?.stop(); cancelAnimationFrame(frame.current); clearInterval(screenTimer.current); screenStream.current?.getTracks().forEach(track => track.stop()); audioContext.current?.close(); if (videoObjectUrl.current) URL.revokeObjectURL(videoObjectUrl.current); if (screenRecordingObjectUrl.current) URL.revokeObjectURL(screenRecordingObjectUrl.current) }, [])
  useEffect(() => { if (videoElement.current) videoElement.current.playbackRate = speed * trackStore.tracks[1].playbackRate * trackStore.tracks[1].clipPlaybackRate }, [speed, trackStore.tracks])
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { if (skipBufferSync.current) { skipBufferSync.current = false; return } if (preserveMainPitch.current !== null) { trackStore.setTrackProcessedBuffer('track-1', buffer, preserveMainPitch.current); preserveMainPitch.current = null } else trackStore.setTrackBuffer('track-1', buffer) }, [buffer, trackStore.setTrackBuffer, trackStore.setTrackProcessedBuffer])
  useEffect(() => {
    const pending = resumeAfterPitch.current
    if (!pending || trackStore.tracks.find(track => track.id === pending.trackId)?.appliedPitchSemitones !== pending.semitones) return
    resumeAfterPitch.current = null
    const resumeAt = pending.time
    const restart = window.requestAnimationFrame(() => void mixerPlayback.playFrom(resumeAt))
    return () => window.cancelAnimationFrame(restart)
  }, [trackStore.tracks, mixerPlayback.playFrom])

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
  const addAudioTrack = () => { trackStore.addTrack(); setStatus('已添加空音轨，可把任意片段拖到这里') }
  const openMediaToClipboard = async (file?: File) => {
    if (!file) return
    try {
      setMediaWorking(true); setStatus('正在打开媒体…')
      const isVideo = file.type.startsWith('video/'), name = file.name.replace(/\.[^.]+$/, '')
      const ctx = audioContext.current ?? new AudioContext(); audioContext.current = ctx
      const data = isVideo ? await (await extractAudioFromVideo(file)).arrayBuffer() : await file.arrayBuffer()
      const decoded = await ctx.decodeAudioData(data)
      const trackId = trackStore.activeId, at = currentTimeRef.current, clipId = trackStore.addClip(trackId, decoded, isVideo ? `${name} · 原声` : name, at)
      if (isVideo) { if (videoObjectUrl.current) URL.revokeObjectURL(videoObjectUrl.current); videoObjectUrl.current = URL.createObjectURL(file); setVideoUrl(videoObjectUrl.current); setStreamSourceUrl('') }
      setAudioClipboard(decoded); setFileName(name); setSelectedClipId(clipId); setSelection([at, at + decoded.duration]); setSettings(value => ({ ...value, start: at, end: at + decoded.duration }))
      setStatus(`${isVideo ? '视频原声' : '音频'}已放入当前音轨的 ${formatTime(at, true)} 位置，可直接播放或拖到其他音轨`)
    } catch { setStatus('无法打开该媒体文件') } finally { setMediaWorking(false) }
  }
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
  const resetScreenRecording = () => {
    clearInterval(screenTimer.current); screenStream.current?.getTracks().forEach(track => track.stop()); screenStream.current = null; screenRecorder.current = null
    if (screenRecordingObjectUrl.current) URL.revokeObjectURL(screenRecordingObjectUrl.current)
    screenRecordingObjectUrl.current = ''; screenRecordingBlob.current = null; setScreenRecordingUrl(''); setScreenRecording(false); setScreenRecordingSeconds(0); setScreenPreviewPlaying(false); setScreenStage('idle'); setScreenError('')
  }
  const attachScreenPreview = (element: HTMLVideoElement | null) => {
    screenPreview.current = element
    const stream = screenStream.current
    if (!element || !stream) return
    if (element.srcObject !== stream) element.srcObject = stream
    element.muted = true; element.playsInline = true
    void element.play().then(() => setScreenPreviewPlaying(true)).catch(() => setScreenPreviewPlaying(false))
  }
  const prepareScreenRecording = async () => {
    if (screenStage !== 'idle' && screenStage !== 'error') return
    setScreenStage('selecting'); setScreenError(''); setStatus('请选择要录制的屏幕、窗口或浏览器标签页…')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: true })
      const videoTrack = stream.getVideoTracks()[0]
      if (captureSize !== 'source' && videoTrack) {
        const size = captureSize === '720' ? { width: 1280, height: 720 } : { width: 1920, height: 1080 }
        await videoTrack.applyConstraints({ width: { ideal: size.width }, height: { ideal: size.height } }).catch(() => undefined)
      }
      screenStream.current = stream; screenChunks.current = []; setScreenPreviewPlaying(false)
      videoTrack?.addEventListener('ended', () => {
        if (screenRecorder.current?.state === 'recording') screenRecorder.current.stop()
        else resetScreenRecording()
      }, { once: true })
      setScreenStage('ready'); setStatus('屏幕来源已准备好；播放目标内容后点击“开始录制”')
      window.setTimeout(() => attachScreenPreview(screenPreview.current), 50)
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'NotAllowedError' ? '你取消了屏幕选择，或没有授予屏幕共享权限。' : '无法准备屏幕录制，请使用最新版 Chrome 或 Edge。'
      setScreenError(message); setScreenStage('error'); setStatus(message)
    }
  }
  const startScreenRecording = () => {
    const stream = screenStream.current
    if (!stream || !stream.active) { setScreenError('共享来源已经关闭，请重新选择。'); setScreenStage('error'); return }
    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm'
      const mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: captureSize === '720' ? 4_000_000 : 8_000_000 })
      screenRecorder.current = mediaRecorder
      mediaRecorder.ondataavailable = event => { if (event.data.size) screenChunks.current.push(event.data) }
      mediaRecorder.onstop = () => {
        clearInterval(screenTimer.current); stream.getTracks().forEach(track => track.stop()); screenStream.current = null; setScreenRecording(false)
        const blob = new Blob(screenChunks.current, { type: mediaRecorder.mimeType || 'video/webm' })
        if (!blob.size) { setScreenError('屏幕录制没有生成内容'); setScreenStage('error'); setStatus('屏幕录制没有生成内容'); return }
        screenRecordingBlob.current = blob
        if (screenRecordingObjectUrl.current) URL.revokeObjectURL(screenRecordingObjectUrl.current)
        screenRecordingObjectUrl.current = URL.createObjectURL(blob); setScreenRecordingUrl(screenRecordingObjectUrl.current); setScreenStage('finished'); setStatus('录制完成：可以保存视频或导入剪辑')
      }
      mediaRecorder.start(500); setScreenRecordingSeconds(0); setScreenRecording(true); setStatus('正在录制屏幕；系统声音取决于共享弹窗中的音频选项')
      setScreenStage('recording')
      screenTimer.current = window.setInterval(() => setScreenRecordingSeconds(value => value + 1), 1000)
    } catch { setScreenError('无法开始录制当前共享来源。'); setScreenStage('error') }
  }
  const stopScreenRecording = () => { if (screenRecorder.current?.state === 'recording') screenRecorder.current.stop() }
  const screenRecordingName = () => `屏幕录制-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.webm`
  const saveScreenRecording = () => {
    if (!screenRecordingUrl) return
    const link = document.createElement('a'); link.href = screenRecordingUrl; link.download = screenRecordingName(); link.click(); setStatus('屏幕录制视频已保存')
  }
  const importScreenRecording = async () => {
    const blob = screenRecordingBlob.current
    if (!blob) return
    const file = new File([blob], screenRecordingName(), { type: blob.type || 'video/webm' })
    resetScreenRecording(); importTarget.current = 'video-1'; await loadFile(file); setStatus('录屏已导入视频监看区，原声已加入视频轨')
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
  const applyPitch = async (trackId: string) => {
    const track = trackStore.tracks.find(item => item.id === trackId), semitones = (track?.pitchSemitones || 0) + (track?.clipPitchSemitones || 0)
    if (!track?.originalBuffer || pitchWorkingId) return
    try {
      setPitchWorkingId(trackId); setStatus(semitones ? `正在生成 ${semitones > 0 ? '+' : ''}${semitones} 半音变调…` : '正在恢复原始音高…')
      const shifted = await pitchShiftWav(bufferToWav(track.originalBuffer), semitones, track.originalBuffer.sampleRate)
      const ctx = audioContext.current ?? new AudioContext(); audioContext.current = ctx
      const decoded = await ctx.decodeAudioData(await shifted.arrayBuffer())
      const shouldResume = mixerPlayback.playing
      if (shouldResume) { resumeAfterPitch.current = { trackId, semitones, time: currentTimeRef.current }; mixerPlayback.stop() }
      if (trackId === 'track-1') { preserveMainPitch.current = semitones; setBuffer(decoded) }
      else trackStore.setTrackProcessedBuffer(trackId, decoded, semitones)
      setStatus(`歌曲变调已应用：${semitones > 0 ? '+' : ''}${semitones} 半音${shouldResume ? '，已从当前位置继续播放' : ''}`)
    } catch { setStatus('歌曲变调失败，请尝试 WAV 文件或较短的片段') }
    finally { setPitchWorkingId('') }
  }
  const separateActiveTrack = () => {
    const track = trackStore.activeTrack
    if (!track.buffer) { setStatus('请先选择含音频的轨道'); return }
    try {
      const vocals = separateStereo(track.buffer, 'vocals'), instrumental = separateStereo(track.buffer, 'instrumental')
      trackStore.addTrack(vocals, `${track.name} · 人声`); trackStore.addTrack(instrumental, `${track.name} · 伴奏`)
      setStatus('本地快速分离完成：已生成人声轨和伴奏轨')
    } catch (error) { setStatus(error instanceof Error ? error.message : '人声分离失败') }
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
  const scrubPlayhead = (clientX: number) => {
    const canvas = timelineBodyRef.current?.querySelector<HTMLElement>('.track-canvas'), rect = canvas?.getBoundingClientRect()
    if (!rect) return
    const time = Math.max(0, Math.min(timelineDuration, (clientX - rect.left) / rect.width * timelineDuration))
    currentTimeRef.current = time; setCurrentTime(time); if (videoElement.current) videoElement.current.currentTime = time
  }
  const beginPlayheadDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault(); playheadDrag.current = { active: true, resume: mixerPlayback.playing }
    mixerPlayback.stop(); stop(); event.currentTarget.setPointerCapture(event.pointerId); scrubPlayhead(event.clientX)
  }
  const movePlayheadDrag = (event: React.PointerEvent<HTMLDivElement>) => { if (playheadDrag.current.active) scrubPlayhead(event.clientX) }
  const endPlayheadDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!playheadDrag.current.active) return
    scrubPlayhead(event.clientX); const resume = playheadDrag.current.resume; playheadDrag.current = { active: false, resume: false }
    setPlaying(false); videoElement.current?.pause()
    if (resume) { void mixerPlayback.playFrom(currentTimeRef.current); if (videoElement.current) { videoElement.current.currentTime = currentTimeRef.current; void videoElement.current.play().catch(() => undefined) }; setStatus('已从拖动后的新位置继续播放') }
    else setStatus('播放头位置已更新；点击主播放键后播放')
  }
  const toggleMixerPlayback = async () => {
    if (mixerPlayback.playing || (videoElement.current && !videoElement.current.paused)) { mixerPlayback.stop(); stop(); videoElement.current?.pause(); setPlaying(false); setStatus('播放已停止'); return }
    await mixerPlayback.playFrom(currentTimeRef.current)
    if (videoElement.current) { videoElement.current.currentTime = currentTimeRef.current; videoElement.current.playbackRate = speed; void videoElement.current.play().catch(() => undefined) }
  }
  const selectedClip = trackStore.activeTrack.clips.find(clip => clip.id === selectedClipId)
  const activeVoicePreset = effectScope === 'clip' ? selectedClip?.voicePreset || 'none' : trackStore.activeTrack.voicePreset
  const activePitchSemitones = effectScope === 'clip' ? selectedClip?.pitchSemitones || 0 : trackStore.activeTrack.pitchSemitones
  useEffect(() => { setPendingVoicePreset(activeVoicePreset) }, [activeVoicePreset, effectScope, selectedClipId, trackStore.activeId])
  const confirmVoicePreset = async () => {
    const preset = pendingVoicePreset, semitones = presetPitch[preset], clips = effectScope === 'clip' ? selectedClip ? [selectedClip] : [] : trackStore.activeTrack.clips
    if (!clips.length || pitchWorkingId) return setStatus('请先选择需要变声的音频片段或音轨')
    try {
      remember(); mixerPlayback.stop(); setPitchWorkingId(`voice-${trackStore.activeId}`); setStatus(`正在生成${effectScope === 'clip' ? '当前片段' : '整条音轨'}变声…`)
      const ctx = audioContext.current ?? new AudioContext(); audioContext.current = ctx
      for (const clip of clips) {
        const originalBuffer = clip.originalBuffer || clip.buffer, originalOffset = clip.originalOffset ?? clip.offset, originalDuration = clip.originalDuration ?? clip.duration
        const sourceClip = renderBuffer(originalBuffer, { start: originalOffset, end: originalOffset + originalDuration, gain: 1, fadeIn: 0, fadeOut: 0 })
        const processed = semitones ? await ctx.decodeAudioData(await (await pitchShiftWav(bufferToWav(sourceClip), semitones, sourceClip.sampleRate)).arrayBuffer()) : sourceClip
        trackStore.updateClip(trackStore.activeId, clip.id, { buffer: processed, offset: 0, duration: processed.duration, voicePreset: effectScope === 'clip' ? preset : 'none', pitchSemitones: semitones, originalBuffer, originalOffset, originalDuration })
      }
      if (effectScope === 'track') trackStore.updateTrack(trackStore.activeId, { voicePreset: preset, pitchSemitones: semitones })
      setStatus(`${effectScope === 'clip' ? '当前片段' : '整条音轨'}变声已生成，可点击播放试听`)
    } catch { setStatus('变声生成失败，请尝试较短的音频片段') } finally { setPitchWorkingId('') }
  }
  const restoreOriginalVoice = () => {
    const clips = effectScope === 'clip' ? selectedClip ? [selectedClip] : [] : trackStore.activeTrack.clips
    if (!clips.length) return setStatus('请先选择需要恢复的片段或音轨')
    remember(); mixerPlayback.stop()
    for (const clip of clips) trackStore.updateClip(trackStore.activeId, clip.id, { buffer: clip.originalBuffer || clip.buffer, offset: clip.originalOffset ?? clip.offset, duration: clip.originalDuration ?? clip.duration, voicePreset: 'none', pitchSemitones: 0 })
    if (effectScope === 'track') trackStore.updateTrack(trackStore.activeId, { voicePreset: 'none', pitchSemitones: 0 })
    setPendingVoicePreset('none'); setStatus(`已将${effectScope === 'clip' ? '当前片段' : '整条音轨'}恢复为原声`)
  }
  const changePitchSemitones = (value: number) => {
    if (effectScope === 'clip') { if (!selectedClip) return setStatus('请先选择一个音频片段'); trackStore.updateClip(trackStore.activeId, selectedClip.id, { pitchSemitones: value }) }
    else trackStore.updateTrack(trackStore.activeId, { pitchSemitones: value })
  }
  const applyCentralPitch = async () => {
    if (effectScope === 'track') return applyPitch(trackStore.activeId)
    if (!selectedClip || pitchWorkingId) return setStatus('请先选择一个音频片段')
    try {
      setPitchWorkingId(selectedClip.id); setStatus('正在生成片段变调…')
      const sourceClip = renderBuffer(selectedClip.buffer, { start: selectedClip.offset, end: selectedClip.offset + selectedClip.duration, gain: 1, fadeIn: 0, fadeOut: 0 })
      const shifted = await pitchShiftWav(bufferToWav(sourceClip), selectedClip.pitchSemitones, sourceClip.sampleRate)
      const ctx = audioContext.current ?? new AudioContext(); audioContext.current = ctx
      const decoded = await ctx.decodeAudioData(await shifted.arrayBuffer())
      trackStore.updateClip(trackStore.activeId, selectedClip.id, { buffer: decoded, offset: 0, duration: decoded.duration })
      setStatus(`当前片段已应用 ${selectedClip.pitchSemitones > 0 ? '+' : ''}${selectedClip.pitchSemitones} 半音变调`)
    } catch { setStatus('片段变调失败，请尝试较短的片段') } finally { setPitchWorkingId('') }
  }
  const selectedSourceRange = () => {
    if (!selectedClip) return null
    const rate = selectedClip.playbackRate * trackStore.activeTrack.playbackRate * trackStore.activeTrack.clipPlaybackRate
    const clipEnd = selectedClip.start + selectedClip.duration / rate
    const from = Math.max(selectedClip.start, Math.min(selection[0], selection[1])), to = Math.min(clipEnd, Math.max(selection[0], selection[1]))
    if (to - from < .001) return { timelineFrom: selectedClip.start, timelineTo: clipEnd, sourceFrom: selectedClip.offset, sourceTo: selectedClip.offset + selectedClip.duration }
    return { timelineFrom: from, timelineTo: to, sourceFrom: selectedClip.offset + (from - selectedClip.start) * rate, sourceTo: selectedClip.offset + (to - selectedClip.start) * rate }
  }
  const remember = () => { setHistory(h => [...h.slice(-29), { tracks: trackStore.tracks, activeId: trackStore.activeId, selection }]); setFuture([]) }
  const selectedVisibleBuffer = () => selectedClip ? renderBuffer(selectedClip.buffer, { start: selectedClip.offset, end: selectedClip.offset + selectedClip.duration, gain: 1, fadeIn: 0, fadeOut: 0 }) : null
  const applyChannelProcess = (options: Partial<ChannelProcessOptions>, label: string) => {
    const source = selectedVisibleBuffer(); if (!selectedClip || !source) return setStatus('请先选择需要编辑声道的音频片段')
    remember(); mixerPlayback.stop(); stop(); videoElement.current?.pause(); setPlaying(false); const processed = processChannels(source, { leftGain: channelMix.leftGain, rightGain: channelMix.rightGain, pan: channelMix.pan, ...options })
    trackStore.updateClip(trackStore.activeId, selectedClip.id, { buffer: processed, offset: 0, duration: processed.duration }); setStatus(`已应用声道处理：${label}`)
  }
  const channelAction = (action: 'swap' | 'muteLeft' | 'muteRight' | 'invertLeft' | 'invertRight' | 'mono' | 'stereo' | 'extractLeft' | 'extractRight') => {
    const source = selectedVisibleBuffer(); if (!selectedClip || !source) return setStatus('请先选择需要编辑声道的音频片段')
    if (action === 'extractLeft' || action === 'extractRight') { remember(); mixerPlayback.stop(); stop(); videoElement.current?.pause(); const side = action === 'extractLeft' ? 0 : 1, extracted = extractChannel(source, side); trackStore.addTrack(extracted, `${selectedClip.name} · ${side ? '右' : '左'}声道`); setStatus(`${side ? '右' : '左'}声道已提取为新的独立音轨`); return }
    const map: Record<Exclude<typeof action, 'extractLeft' | 'extractRight'>, [Partial<ChannelProcessOptions>, string]> = { swap: [{ swap: true }, '交换左右声道'], muteLeft: [{ muteLeft: true }, '静音左声道'], muteRight: [{ muteRight: true }, '静音右声道'], invertLeft: [{ invertLeft: true }, '左声道相位反转'], invertRight: [{ invertRight: true }, '右声道相位反转'], mono: [{ mono: true }, '立体声转单声道'], stereo: [{ forceStereo: true }, '复制成立体声'] }
    const [options, label] = map[action]; applyChannelProcess(options, label)
  }
  const keepSelection = () => { const range = selectedSourceRange(); if (!selectedClip || !range) return setStatus('请先用选择工具拖出区间'); remember(); trackStore.updateClip(trackStore.activeId, selectedClip.id, { start: range.timelineFrom, offset: range.sourceFrom, duration: range.sourceTo - range.sourceFrom }); setSelection([range.timelineFrom, range.timelineTo]); setStatus('已只保留选区，其他轨道位置保持不变') }
  const deleteSelection = () => { const range = selectedSourceRange(); if (!selectedClip || !range) return setStatus('请先用选择工具拖出区间'); remember(); trackStore.removeClipRange(trackStore.activeId, selectedClip.id, range.timelineFrom, range.timelineTo); setSelectedClipId(''); setSelection([0, 0]); setStatus('已删除选区，左右片段清楚分开，其他轨道位置不变') }
  const copySelection = () => { const range = selectedSourceRange(); if (!selectedClip || !range) return setStatus('请先用选择工具拖出区间'); const copied = renderBuffer(selectedClip.buffer, { start: range.sourceFrom, end: range.sourceTo, gain: 1, fadeIn: 0, fadeOut: 0 }); setAudioClipboard(copied); setStatus(`已复制选区：${formatTime(range.timelineTo - range.timelineFrom, true)}`) }
  const cutSelection = () => {
    const range = selectedSourceRange(); if (!selectedClip || !range) return setStatus('请先用选择工具拖出区间')
    remember()
    const copied = renderBuffer(selectedClip.buffer, { start: range.sourceFrom, end: range.sourceTo, gain: 1, fadeIn: 0, fadeOut: 0 })
    setAudioClipboard(copied)
    trackStore.splitClipRange(trackStore.activeId, selectedClip.id, range.timelineFrom, range.timelineTo)
    setSelectedClipId('')
    setTimelineTool('move')
    setStatus('已分割并切回移动模式：按住中间片段，可上下拖到任意音轨')
  }
  const pasteAudio = () => { if (!audioClipboard) return; remember(); const trackId = trackStore.activeId, at = currentTimeRef.current; const id = trackStore.addClip(trackId, audioClipboard, '粘贴片段', at); setSelectedClipId(id); setSelection([at, at + audioClipboard.duration]); setStatus('片段已粘贴到播放头位置，不会推挤其他片段') }
  const moveTimelineClip = (clipId: string, start: number, targetTrackId: string) => { remember(); trackStore.moveClipToTrack(clipId, targetTrackId, start); trackStore.setActiveId(targetTrackId); setStatus(`片段已移动到目标音轨的 ${formatTime(start, true)}`) }
  const trimTimelineClip = (clipId: string, patch: Partial<import('./mixer').AudioClip>) => { trackStore.updateClip(trackStore.activeId, clipId, patch); setStatus('正在调整片段入点或出点') }
  const transformSelection = (mode: 'silence' | 'reverse' | 'normalize' | 'fadeIn' | 'fadeOut', label: string) => { if (!selectedClip) return setStatus('请先点击需要处理的音频片段'); remember(); const fragment = renderBuffer(selectedClip.buffer, { start: selectedClip.offset, end: selectedClip.offset + selectedClip.duration, gain: 1, fadeIn: 0, fadeOut: 0 }), processed = transformRange(fragment, 0, fragment.duration, mode); trackStore.updateClip(trackStore.activeId, selectedClip.id, { buffer: processed, offset: 0, duration: processed.duration }); setStatus(`片段已应用：${label}`) }
  const splitAtPlayhead = () => {
    const clip = trackStore.activeTrack.clips.find(item => item.id === selectedClipId) || trackStore.activeTrack.clips.find(item => currentTimeRef.current > item.start && currentTimeRef.current < item.start + item.duration / (trackStore.activeTrack.playbackRate * trackStore.activeTrack.clipPlaybackRate * item.playbackRate))
    if (!clip) return setStatus('请先选择片段，并把播放头放在片段中间')
    remember(); trackStore.splitClip(trackStore.activeId, clip.id, currentTimeRef.current); setSelectedClipId(''); setStatus('已在播放头处分割为两个独立片段，可分别拖动和编辑')
  }
  const duplicateSelectionToTrack = () => { if (!selectedClip) return setStatus('请先点击需要复制的音频片段'); remember(); const clip = renderBuffer(selectedClip.buffer, { start: selectedClip.offset, end: selectedClip.offset + selectedClip.duration, gain: 1, fadeIn: 0, fadeOut: 0 }), newId = trackStore.addTrack(clip, `${selectedClip.name} · 副本`); trackStore.setActiveId(newId); setSelectedClipId(''); setSelection([0, clip.duration]); setStatus('片段已复制到新音轨') }
  const mergeSelectedTracks = async () => { try { const merged = await mixTracks(trackStore.tracks.filter(track => track.includeInExport), false, 1, 1); trackStore.addTrack(merged, '合并音频'); setSelection([0, merged.duration]); setStatus('已将勾选导出的轨道合并为新音轨') } catch { setStatus('至少需要一条有音频且已勾选导出的轨道') } }
  const importAudioFragment = async (file?: File) => {
    if (!file) return
    try { const ctx = audioContext.current ?? new AudioContext(); audioContext.current = ctx; const decoded = await ctx.decodeAudioData(await file.arrayBuffer()), name = file.name.replace(/\.[^.]+$/, ''); if (!trackStore.activeTrack) { const id = trackStore.addTrack(decoded, name); trackStore.setActiveId(id); setSelection([0, decoded.duration]); setStatus('片段已导入新音轨'); return } const at = currentTimeRef.current, clipId = trackStore.addClip(trackStore.activeId, decoded, name, at); setSelectedClipId(clipId); setSelection([at, at + decoded.duration]); setStatus('片段已加入当前音轨和统一时间线') } catch { setStatus('无法导入该音频片段') }
  }
  const restoreSnapshot = (snapshot: Snapshot) => { mixerPlayback.stop(); const main = snapshot.tracks.find(track => track.id === 'track-1'); trackStore.replaceTracks(snapshot.tracks); trackStore.setActiveId(snapshot.activeId); if (main?.buffer !== buffer) { skipBufferSync.current = true; setBuffer(main?.buffer || null) } setSelection(snapshot.selection); setSettings(s => ({ ...s, start: snapshot.selection[0], end: snapshot.selection[1] })) }
  const undo = () => { const last = history.at(-1); if (!last) return; setFuture(f => [{ tracks: trackStore.tracks, activeId: trackStore.activeId, selection }, ...f]); restoreSnapshot(last); setHistory(h => h.slice(0, -1)); setStatus('已撤销上一步剪辑') }
  const redo = () => { const next = future[0]; if (!next) return; setHistory(h => [...h, { tracks: trackStore.tracks, activeId: trackStore.activeId, selection }]); restoreSnapshot(next); setFuture(f => f.slice(1)); setStatus('已重做剪辑') }
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

  const Tool = ({ icon, label, action, disabled = false, active = false }: { icon: React.ReactNode; label: string; action?: () => void; disabled?: boolean; active?: boolean }) => <button className={`tool ${active ? 'active' : ''}`} onClick={action} disabled={disabled}>{icon}<span>{label}</span></button>
  return <div className="app" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); loadFile(e.dataTransfer.files[0]) }}>
    <header><div className="brand"><span className="brand-mark"><i/><i/><i/><i/><i/></span><b>声刻</b><span>SoundCut</span></div><div className="project">{fileName}</div><div className="header-actions"><button aria-label="撤销" onClick={undo} disabled={!history.length}><Undo2/></button><button aria-label="重做" onClick={redo} disabled={!future.length}><Redo2/></button><button className="export" onClick={exportAudio} disabled={mediaWorking}><Download/> {mediaWorking ? '处理中' : '导出'}</button></div></header>
    <main>
      <aside className="tools"><button className="import" onClick={() => requestImport('main')}><Upload/>导入媒体</button><input ref={input} type="file" accept="audio/*,video/*" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void loadFile(file) }}/><input ref={fragmentInput} type="file" accept="audio/*,video/*" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void openMediaToClipboard(file) }}/><div className="screen-record-config"><button className={`tool ${screenRecording ? 'recording' : ''}`} onClick={screenStage === 'recording' ? stopScreenRecording : screenStage === 'idle' || screenStage === 'error' ? prepareScreenRecording : () => undefined}><MonitorUp/><span>{screenStage === 'selecting' ? '选择录制来源…' : screenStage === 'ready' ? '预录制已就绪' : screenStage === 'recording' ? `录制中 ${formatTime(screenRecordingSeconds)}` : screenStage === 'finished' ? '录制已完成' : '录制屏幕'}</span></button><select value={captureSize} disabled={screenStage !== 'idle' && screenStage !== 'error'} onChange={e => setCaptureSize(e.target.value as typeof captureSize)} aria-label="录屏清晰度"><option value="source">原始尺寸</option><option value="720">720p</option><option value="1080">1080p</option></select></div><Tool icon={<MousePointer2/>} label={timelineTool === 'select' ? '选择中' : '选择'} active={timelineTool === 'select'} action={() => { setTimelineTool(tool => tool === 'select' ? 'move' : 'select'); setStatus(timelineTool === 'select' ? '已切回片段移动模式' : '选择模式：在音频波形上按住鼠标拖出区间') }}/><Tool icon={<Scissors/>} label="保留选区" action={keepSelection} disabled={!selectedClip}/><Tool icon={<Trash2/>} label="删除选区" action={deleteSelection} disabled={!selectedClip}/><Tool icon={<Waves/>} label="淡入 / 淡出"/><div className="tool-spacer"/><Tool icon={<Undo2/>} label="撤销" action={undo} disabled={!history.length}/><Tool icon={<Redo2/>} label="重做" action={redo} disabled={!future.length}/></aside>
      <section className="workspace">
        <AudioEditToolbar disabled={!trackStore.activeTrack.clips.length} canPaste={!!audioClipboard} onCut={cutSelection} onCopy={copySelection} onPaste={pasteAudio} onDelete={deleteSelection} onTrim={keepSelection} onSplit={splitAtPlayhead} onDuplicate={duplicateSelectionToTrack} onImport={() => fragmentInput.current?.click()} onMerge={() => void mergeSelectedTracks()} onSilence={() => transformSelection('silence', '静音')} onReverse={() => transformSelection('reverse', '反转')} onNormalize={() => transformSelection('normalize', '标准化')} onFadeIn={() => transformSelection('fadeIn', '淡入')} onFadeOut={() => transformSelection('fadeOut', '淡出')} effectScope={effectScope} voicePreset={pendingVoicePreset} pitchSemitones={activePitchSemitones} onEffectScope={setEffectScope} onVoicePreset={setPendingVoicePreset} onApplyVoice={() => void confirmVoicePreset()} onRestoreVoice={restoreOriginalVoice} onPitchSemitones={changePitchSemitones} onApplyPitch={() => void applyCentralPitch()}/>
        <ChannelEditor disabled={!selectedClip} channels={selectedClip?.buffer.numberOfChannels || 0} leftGain={channelMix.leftGain} rightGain={channelMix.rightGain} pan={channelMix.pan} onLeftGain={leftGain => setChannelMix(value => ({ ...value, leftGain }))} onRightGain={rightGain => setChannelMix(value => ({ ...value, rightGain }))} onPan={pan => setChannelMix(value => ({ ...value, pan }))} onApply={() => applyChannelProcess({}, '左右音量与声像')} onAction={channelAction}/>
        <div className="master-controls"><strong>总控</strong><label>速度<PreciseRange ariaLabel="总速度" min={.5} max={2} step={.05} value={speed} onChange={setSpeed}/><output>{speed.toFixed(2)}×</output></label><label>主音量<PreciseRange ariaLabel="主音量" min={0} max={2} step={.01} value={masterVolume} onChange={setMasterVolume}/><output>{Math.round(masterVolume * 100)}%</output></label><button className={`compact-tracks-toggle ${compactTracks ? 'active' : ''}`} onClick={() => setCompactTracks(value => !value)}>{compactTracks ? '紧凑轨道' : '标准轨道'}</button></div>
        <div className={`timeline-body ${compactTracks ? 'compact' : ''}`} ref={timelineBodyRef} style={{ '--one-second-step': `${1 / timelineDuration * 100}%`, '--five-second-step': `${5 / timelineDuration * 100}%` } as React.CSSProperties}>
        <div className="ruler" style={{ '--five-second-step': `${5 / timelineDuration * 100}%` } as React.CSSProperties}>{Array.from({length: Math.floor(timelineDuration / 5) + 1}, (_, i) => <span key={i}>{formatTime(i * 5)}</span>)}</div>
        <div className="timeline-playhead" style={{ '--playhead': playheadPercent } as React.CSSProperties} onPointerDown={beginPlayheadDrag} onPointerMove={movePlayheadDrag} onPointerUp={endPlayheadDrag} onPointerCancel={endPlayheadDrag}><span>{formatTime(currentTime, true)}</span></div>
        <div className={`track ${trackStore.tracks[0].expanded ? 'expanded' : ''}`}><TrackControls track={trackStore.tracks[0]} active={trackStore.activeId === 'track-1'} onActivate={() => trackStore.setActiveId('track-1')} onChange={patch => trackStore.updateTrack('track-1', patch)} onApplyPitch={() => applyPitch('track-1')}/><div className="track-canvas">{trackStore.tracks[0].clips.length ? <><TrackClipLane track={trackStore.tracks[0]} timelineDuration={timelineDuration} tool={timelineTool} selection={selection} onSelection={setSelection} selectedClipId={selectedClipId} onSelect={clip => { trackStore.setActiveId('track-1'); setSelectedClipId(clip.id); setSelection([clip.start, clip.start + clip.duration / (trackStore.tracks[0].playbackRate * trackStore.tracks[0].clipPlaybackRate * clip.playbackRate)]) }} onMove={moveTimelineClip} onTrim={trimTimelineClip} onSeek={seek}/><ClipControls track={trackStore.tracks[0]} onChange={patch => trackStore.updateTrack('track-1', patch)} onApplyPitch={() => applyPitch('track-1')}/></> : <div className="empty" data-track-id="track-1"><strong>空音轨</strong><span>把片段拖到这里</span></div>}</div></div>
        <div className={`track video-audio-track ${trackStore.tracks[1].expanded ? 'expanded' : ''}`}><TrackControls track={trackStore.tracks[1]} active={trackStore.activeId === 'video-1'} onActivate={() => trackStore.setActiveId('video-1')} onChange={patch => trackStore.updateTrack('video-1', patch)} onApplyPitch={() => applyPitch('video-1')} onExtract={trackStore.tracks[1].buffer ? extractVideoToMain : undefined}/><div className="track-canvas">{trackStore.tracks[1].buffer ? <><TrackClipLane track={trackStore.tracks[1]} timelineDuration={timelineDuration} tool={timelineTool} selection={selection} onSelection={setSelection} selectedClipId={selectedClipId} onSelect={clip => { trackStore.setActiveId('video-1'); setSelectedClipId(clip.id); setSelection([clip.start, clip.start + clip.duration / (trackStore.tracks[1].playbackRate * trackStore.tracks[1].clipPlaybackRate * clip.playbackRate)]) }} onMove={moveTimelineClip} onTrim={trimTimelineClip} onSeek={seek}/><ClipControls track={trackStore.tracks[1]} onChange={patch => trackStore.updateTrack('video-1', patch)} onApplyPitch={() => applyPitch('video-1')}/></> : <div className="video-empty" data-track-id="video-1"><span>空音轨 · 把片段拖到这里</span></div>}</div></div>
        <div className={`track ${trackStore.tracks[2].expanded ? 'expanded' : ''}`}><TrackControls track={trackStore.tracks[2]} active={trackStore.activeId === 'track-3'} onActivate={() => trackStore.setActiveId('track-3')} onChange={patch => trackStore.updateTrack('track-3', patch)} onApplyPitch={() => applyPitch('track-3')}/><div className="track-canvas">{trackStore.tracks[2].buffer ? <><TrackClipLane track={trackStore.tracks[2]} timelineDuration={timelineDuration} tool={timelineTool} selection={selection} onSelection={setSelection} selectedClipId={selectedClipId} onSelect={clip => { trackStore.setActiveId('track-3'); setSelectedClipId(clip.id); setSelection([clip.start, clip.start + clip.duration / (trackStore.tracks[2].playbackRate * trackStore.tracks[2].clipPlaybackRate * clip.playbackRate)]) }} onMove={moveTimelineClip} onTrim={trimTimelineClip} onSeek={seek}/><ClipControls track={trackStore.tracks[2]} onChange={patch => trackStore.updateTrack('track-3', patch)} onApplyPitch={() => applyPitch('track-3')}/></> : <div className="video-empty" data-track-id="track-3"><span>空音轨 · 把片段拖到这里</span></div>}</div></div>
        {trackStore.tracks.slice(3).map(track => <div className={`track extra-track ${track.expanded ? 'expanded' : ''}`} key={track.id}><TrackControls track={track} active={trackStore.activeId === track.id} onActivate={() => trackStore.setActiveId(track.id)} onChange={patch => trackStore.updateTrack(track.id, patch)} onApplyPitch={() => applyPitch(track.id)} onDelete={() => trackStore.deleteTrack(track.id)}/><div className="track-canvas">{track.buffer ? <><TrackClipLane track={track} timelineDuration={timelineDuration} tool={timelineTool} selection={selection} onSelection={setSelection} selectedClipId={selectedClipId} onSelect={clip => { trackStore.setActiveId(track.id); setSelectedClipId(clip.id); setSelection([clip.start, clip.start + clip.duration / (track.playbackRate * track.clipPlaybackRate * clip.playbackRate)]) }} onMove={moveTimelineClip} onTrim={trimTimelineClip} onSeek={seek}/><ClipControls track={track} onChange={patch => trackStore.updateTrack(track.id, patch)} onApplyPitch={() => applyPitch(track.id)}/></> : <div className="video-empty" data-track-id={track.id}><span>空音轨 · 把片段拖到这里</span></div>}</div></div>)}
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
          <div className="stem-separation"><div><strong>人声 / 伴奏分离</strong><span>本地快速立体声分离</span></div><button onClick={separateActiveTrack} disabled={!trackStore.activeTrack.buffer}><UserRound/><AudioLines/>生成两条轨道</button></div><hr/>
          <label>总控音量 <output>{Math.round(masterVolume * 100)}%</output><PreciseRange ariaLabel="主音量" min={0} max={2} step={.01} value={masterVolume} onChange={setMasterVolume}/></label>
          <label>淡入 <output>{settings.fadeIn.toFixed(1)}s</output><PreciseRange ariaLabel="淡入时长" min={0} max={10} step={.1} value={settings.fadeIn} onChange={fadeIn => setSettings({...settings, fadeIn})}/></label>
          <label>淡出 <output>{settings.fadeOut.toFixed(1)}s</output><PreciseRange ariaLabel="淡出时长" min={0} max={10} step={.1} value={settings.fadeOut} onChange={fadeOut => setSettings({...settings, fadeOut})}/></label>
          <label>播放速度 <output>{speed.toFixed(2)}×</output><PreciseRange ariaLabel="总速度" min={.5} max={2} step={.05} value={speed} onChange={setSpeed}/></label><hr/>
          <label>导出格式<select value={exportFormat} onChange={e => setExportFormat(e.target.value as AudioExportFormat)}><option value="wav">WAV · 16 bit</option><option value="mp3">MP3 · 192 kbps</option><option value="m4a">M4A / AAC · 192 kbps</option><option value="flac">FLAC · 无损</option><option value="ogg">OGG Vorbis</option></select></label>
          <div className="selection-info"><span>当前选区</span><b>{formatTime(selection[0], true)} — {formatTime(selection[1], true)}</b></div>
        </div> : <TranscriptPanel fileName={fileName} hasAudio={!!trackStore.activeTrack.buffer} language={language} onLanguage={setLanguage} contentMode={contentMode} onContentMode={setContentMode} segments={transcript} onSegments={setTranscript} onSeek={seek} onTranscribe={transcribe} progress={transcriptionProgress} working={transcribing} error={transcriptionError}/>} 
      </aside>
    </main>

    {screenStage !== 'idle' && <div className="capture-overlay"><section className="capture-dialog" role="dialog" aria-modal="true" aria-label="屏幕录制"><div className="capture-title"><div><h2>屏幕录制</h2><p>{screenStage === 'selecting' ? '请在浏览器弹窗中选择屏幕、窗口或标签页' : screenStage === 'ready' ? '预录制状态：先播放要录制的内容，再点击开始录制' : screenStage === 'recording' ? '正在录制共享画面' : screenStage === 'finished' ? '录制完成，可以保存或导入剪辑' : screenError}</p></div><span className={`stage-badge ${screenStage}`}>{screenStage === 'selecting' ? '选择来源' : screenStage === 'ready' ? '预录制' : screenStage === 'recording' ? `录制中 ${formatTime(screenRecordingSeconds)}` : screenStage === 'finished' ? '已完成' : '发生错误'}</span></div><div className="capture-preview">{screenStage === 'finished' && screenRecordingUrl ? <video src={screenRecordingUrl} controls playsInline/> : screenStage === 'ready' || screenStage === 'recording' ? <><video ref={attachScreenPreview} muted autoPlay playsInline onLoadedData={event => { setScreenPreviewPlaying(true); void event.currentTarget.play().catch(() => setScreenPreviewPlaying(false)) }}/>{!screenPreviewPlaying && <button className="start-screen-preview" onClick={() => attachScreenPreview(screenPreview.current)}><Play/>显示共享画面</button>}</> : <div className="capture-placeholder"><MonitorUp/><span>{screenStage === 'selecting' ? '等待选择录制来源…' : screenError}</span></div>}</div><div className="capture-note">提示：录制网页视频时优先选择“浏览器标签页”，并在共享弹窗中开启“同时共享标签页音频”。</div><div className="capture-actions">{screenStage === 'ready' && <><button onClick={resetScreenRecording}>取消</button><button className="primary" onClick={startScreenRecording}><span className="record-dot"/>开始录制</button></>}{screenStage === 'recording' && <button className="danger" onClick={stopScreenRecording}><Square fill="currentColor"/>停止录制</button>}{screenStage === 'finished' && <><button onClick={resetScreenRecording}>关闭</button><button onClick={saveScreenRecording}><Download/>保存视频</button><button className="primary" onClick={importScreenRecording}><Video/>导入剪辑</button></>}{screenStage === 'error' && <><button onClick={resetScreenRecording}>关闭</button><button className="primary" onClick={() => { resetScreenRecording(); window.setTimeout(() => void prepareScreenRecording(), 0) }}><MonitorUp/>重新选择</button></>}</div></section></div>}
    <footer><div className="time"><strong>{formatTime(currentTime, true)}</strong><span>/ {formatTime(mixerPlayback.duration, true)}</span></div><div className="transport"><button title="返回00:00开头" aria-label="返回开头" onClick={() => seek(0)}><Rewind/></button><button title="后退5秒" aria-label="后退5秒" onClick={() => seek(Math.max(0, currentTime - 5))}><SkipBack/></button><button className="play" aria-label={mixerPlayback.playing ? '暂停' : '播放'} onClick={toggleMixerPlayback}>{mixerPlayback.playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button><button title="前进5秒" aria-label="前进5秒" onClick={() => seek(Math.min(mixerPlayback.duration, currentTime + 5))}><SkipForward/></button></div><div className="zoom"><ZoomOut/><input type="range" defaultValue="60"/><ZoomIn/></div><div className="status"><RotateCcw/>{status}</div></footer>
  </div>
}
