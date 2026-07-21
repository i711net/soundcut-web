import { Gauge, Volume2 } from 'lucide-react'
import type { MixerTrack } from './mixer'

type Props = { track: MixerTrack; onChange: (patch: Partial<MixerTrack>) => void; onApplyPitch?: () => void }

export default function ClipControls({ track, onChange, onApplyPitch }: Props) {
  if (!track.buffer) return null
  return <div className="clip-controls" onPointerDown={event => event.stopPropagation()}>
    <span>片段</span>
    <label title="片段播放速度"><Gauge/><input type="range" min=".5" max="2" step=".05" value={track.clipPlaybackRate} onChange={event => onChange({ clipPlaybackRate: +event.target.value })}/><output>{track.clipPlaybackRate.toFixed(2)}×</output></label>
    <label title="片段音量"><Volume2/><input type="range" min="0" max="2" step=".01" value={track.clipVolume} onChange={event => onChange({ clipVolume: +event.target.value })}/><output>{Math.round(track.clipVolume * 100)}%</output></label>
  </div>
}
