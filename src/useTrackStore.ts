import { useCallback, useMemo, useRef, useState } from 'react'
import { newTrack, type MixerTrack, type TrackKind } from './mixer'

const initialTracks = [newTrack('track-1', '主音轨', 'main'), newTrack('video-1', '视频原声', 'video'), newTrack('track-3', '背景音乐', 'audio')]

export function useTrackStore() {
  const [tracks, setTracks] = useState<MixerTrack[]>(initialTracks)
  const [activeId, setActiveId] = useState('track-1')
  const nextTrackNumber = useRef(4)
  const activeTrack = useMemo(() => tracks.find(track => track.id === activeId) || tracks[0], [activeId, tracks])
  const updateTrack = useCallback((id: string, patch: Partial<MixerTrack>) => setTracks(items => items.map(track => track.id === id ? { ...track, ...patch } : track)), [])
  const setTrackBuffer = useCallback((id: string, buffer: AudioBuffer | null, name?: string) => setTracks(items => items.map(track => track.id === id ? { ...track, buffer, originalBuffer: buffer, appliedPitchSemitones: 0, ...(name ? { name } : {}) } : track)), [])
  const setTrackEditedBuffer = useCallback((id: string, buffer: AudioBuffer | null) => setTracks(items => items.map(track => track.id === id ? { ...track, buffer, appliedPitchSemitones: 0 } : track)), [])
  const setTrackProcessedBuffer = useCallback((id: string, buffer: AudioBuffer | null, appliedPitchSemitones: number) => setTracks(items => items.map(track => track.id === id ? { ...track, buffer, appliedPitchSemitones } : track)), [])
  const addTrack = useCallback((buffer: AudioBuffer | null = null, name?: string, kind: TrackKind = 'audio') => {
    const id = `track-${nextTrackNumber.current++}`
    setTracks(items => [...items, newTrack(id, name || `音轨 ${items.length + 1}`, kind, buffer)]); setActiveId(id); return id
  }, [])
  const extractVideoToMain = useCallback(() => setTracks(items => {
    const video = items.find(track => track.kind === 'video'), main = items.find(track => track.kind === 'main')
    if (!video?.buffer || !main) return items
    return items.map(track => track.id === main.id ? { ...track, buffer: video.buffer, name: `${video.name} · 提取音频` } : track.id === video.id ? { ...track, muted: true } : track)
  }), [])
  const deleteTrack = useCallback((id: string) => setTracks(items => {
    const target = items.find(track => track.id === id)
    if (!target || target.kind === 'main' || target.kind === 'video') return items
    const next = items.filter(track => track.id !== id)
    setActiveId(current => current === id ? 'track-1' : current)
    return next
  }), [])
  return { tracks, activeId, activeTrack, setActiveId, updateTrack, setTrackBuffer, setTrackEditedBuffer, setTrackProcessedBuffer, addTrack, deleteTrack, extractVideoToMain }
}
