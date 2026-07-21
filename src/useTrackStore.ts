import { useCallback, useMemo, useRef, useState } from 'react'
import { newClip, newTrack, type AudioClip, type MixerTrack, type TrackKind } from './mixer'

const initialTracks = [newTrack('track-1', '主音轨', 'main'), newTrack('video-1', '视频原声', 'video'), newTrack('track-3', '背景音乐', 'audio')]

export function useTrackStore() {
  const [tracks, setTracks] = useState<MixerTrack[]>(initialTracks)
  const [activeId, setActiveId] = useState('track-1')
  const nextTrackNumber = useRef(4)
  const activeTrack = useMemo(() => tracks.find(track => track.id === activeId) || tracks[0], [activeId, tracks])
  const updateTrack = useCallback((id: string, patch: Partial<MixerTrack>) => setTracks(items => items.map(track => track.id === id ? { ...track, ...patch } : track)), [])
  const replaceTracks = useCallback((next: MixerTrack[]) => setTracks(next), [])
  const setTrackBuffer = useCallback((id: string, buffer: AudioBuffer | null, name?: string) => setTracks(items => items.map(track => track.id === id ? { ...track, buffer, originalBuffer: buffer, clips: buffer ? [newClip(buffer, name || track.name)] : [], appliedPitchSemitones: 0, ...(name ? { name } : {}) } : track)), [])
  const setTrackEditedBuffer = useCallback((id: string, buffer: AudioBuffer | null) => setTracks(items => items.map(track => track.id === id ? { ...track, buffer, clips: buffer ? [newClip(buffer, track.name)] : [], appliedPitchSemitones: 0 } : track)), [])
  const setTrackProcessedBuffer = useCallback((id: string, buffer: AudioBuffer | null, appliedPitchSemitones: number) => setTracks(items => items.map(track => track.id === id ? { ...track, buffer, clips: buffer ? [newClip(buffer, track.name, track.clips[0]?.start || 0)] : [], appliedPitchSemitones } : track)), [])
  const addTrack = useCallback((buffer: AudioBuffer | null = null, name?: string, kind: TrackKind = 'audio') => {
    const id = `track-${nextTrackNumber.current++}`
    setTracks(items => [...items, newTrack(id, name || `音轨 ${items.length + 1}`, kind, buffer)]); setActiveId(id); return id
  }, [])
  const addClip = useCallback((trackId: string, buffer: AudioBuffer, name: string, start: number) => { const clip = newClip(buffer, name, start); setTracks(items => items.map(track => track.id === trackId ? { ...track, buffer: track.buffer || buffer, originalBuffer: track.originalBuffer || buffer, clips: [...track.clips, clip] } : track)); return clip.id }, [])
  const updateClip = useCallback((trackId: string, clipId: string, patch: Partial<AudioClip>) => setTracks(items => items.map(track => track.id === trackId ? { ...track, clips: track.clips.map(clip => clip.id === clipId ? { ...clip, ...patch } : clip) } : track)), [])
  const moveClipToTrack = useCallback((clipId: string, targetTrackId: string, start: number) => setTracks(items => {
    const source = items.find(track => track.clips.some(clip => clip.id === clipId)), clip = source?.clips.find(item => item.id === clipId)
    if (!source || !clip) return items
    return items.map(track => track.id === source.id && source.id !== targetTrackId ? { ...track, clips: track.clips.filter(item => item.id !== clipId) } : track.id === targetTrackId ? { ...track, buffer: track.buffer || clip.buffer, originalBuffer: track.originalBuffer || clip.buffer, clips: track.clips.some(item => item.id === clipId) ? track.clips.map(item => item.id === clipId ? { ...item, start } : item) : [...track.clips, { ...clip, start }] } : track)
  }), [])
  const deleteClip = useCallback((trackId: string, clipId: string) => setTracks(items => items.map(track => track.id === trackId ? { ...track, clips: track.clips.filter(clip => clip.id !== clipId) } : track)), [])
  const removeClipRange = useCallback((trackId: string, clipId: string, timelineFrom: number, timelineTo: number) => setTracks(items => items.map(track => {
    if (track.id !== trackId) return track
    const target = track.clips.find(clip => clip.id === clipId); if (!target) return track
    const rate = target.playbackRate * track.playbackRate * track.clipPlaybackRate, clipEnd = target.start + target.duration / rate
    const from = Math.max(target.start, timelineFrom), to = Math.min(clipEnd, timelineTo); if (to - from < .001) return track
    const sourceFrom = target.offset + (from - target.start) * rate, sourceTo = target.offset + (to - target.start) * rate
    const parts: AudioClip[] = []
    if (sourceFrom - target.offset > .001) parts.push({ ...target, duration: sourceFrom - target.offset })
    if (target.offset + target.duration - sourceTo > .001) parts.push({ ...target, id: newClip(target.buffer).id, name: `${target.name} · 片段`, start: to, offset: sourceTo, duration: target.offset + target.duration - sourceTo })
    return { ...track, clips: track.clips.flatMap(clip => clip.id === clipId ? parts : [clip]) }
  })), [])
  const splitClip = useCallback((trackId: string, clipId: string, timelineTime: number) => setTracks(items => items.map(track => {
    if (track.id !== trackId) return track
    const clip = track.clips.find(item => item.id === clipId); if (!clip) return track
    const rate = clip.playbackRate * track.playbackRate * track.clipPlaybackRate, sourceAt = clip.offset + (timelineTime - clip.start) * rate
    if (sourceAt <= clip.offset + .01 || sourceAt >= clip.offset + clip.duration - .01) return track
    const left: AudioClip = { ...clip, duration: sourceAt - clip.offset }, right: AudioClip = { ...clip, id: newClip(clip.buffer).id, name: `${clip.name} · 片段`, start: timelineTime, offset: sourceAt, duration: clip.offset + clip.duration - sourceAt }
    return { ...track, clips: track.clips.flatMap(item => item.id === clipId ? [left, right] : [item]) }
  })), [])
  const splitClipRange = useCallback((trackId: string, clipId: string, timelineFrom: number, timelineTo: number) => setTracks(items => items.map(track => {
    if (track.id !== trackId) return track
    const clip = track.clips.find(item => item.id === clipId); if (!clip) return track
    const rate = clip.playbackRate * track.playbackRate * track.clipPlaybackRate, clipEnd = clip.start + clip.duration / rate
    const from = Math.max(clip.start, Math.min(timelineFrom, timelineTo)), to = Math.min(clipEnd, Math.max(timelineFrom, timelineTo))
    if (to - from < .001) return track
    const sourceFrom = clip.offset + (from - clip.start) * rate, sourceTo = clip.offset + (to - clip.start) * rate, sourceEnd = clip.offset + clip.duration
    const parts: AudioClip[] = []
    if (sourceFrom - clip.offset > .001) parts.push({ ...clip, duration: sourceFrom - clip.offset })
    parts.push({ ...clip, id: newClip(clip.buffer).id, name: `${clip.name} · 选区`, start: from, offset: sourceFrom, duration: sourceTo - sourceFrom })
    if (sourceEnd - sourceTo > .001) parts.push({ ...clip, id: newClip(clip.buffer).id, name: `${clip.name} · 片段`, start: to, offset: sourceTo, duration: sourceEnd - sourceTo })
    return { ...track, clips: track.clips.flatMap(item => item.id === clipId ? parts : [item]) }
  })), [])
  const extractVideoToMain = useCallback(() => setTracks(items => {
    const video = items.find(track => track.kind === 'video'), main = items.find(track => track.kind === 'main')
    if (!video?.buffer || !main) return items
    return items.map(track => track.id === main.id ? { ...track, buffer: video.buffer, originalBuffer: video.originalBuffer, clips: video.clips.map(clip => ({ ...clip, id: newClip(clip.buffer).id })), name: `${video.name} · 提取音频` } : track.id === video.id ? { ...track, muted: true } : track)
  }), [])
  const deleteTrack = useCallback((id: string) => setTracks(items => {
    const target = items.find(track => track.id === id)
    if (!target || target.kind === 'main' || target.kind === 'video') return items
    const next = items.filter(track => track.id !== id)
    setActiveId(current => current === id ? 'track-1' : current)
    return next
  }), [])
  return { tracks, activeId, activeTrack, setActiveId, replaceTracks, updateTrack, setTrackBuffer, setTrackEditedBuffer, setTrackProcessedBuffer, addTrack, addClip, updateClip, moveClipToTrack, deleteClip, removeClipRange, splitClip, splitClipRange, deleteTrack, extractVideoToMain }
}
