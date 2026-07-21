import { Gauge, Volume2 } from 'lucide-react'
import type { MixerTrack } from './mixer'
import PreciseRange from './PreciseRange'

type Props = { track: MixerTrack; onChange: (patch: Partial<MixerTrack>) => void; onApplyPitch?: () => void }

export default function ClipControls({ track, onChange, onApplyPitch }: Props) {
  if (!track.buffer) return null
  return <div className="clip-controls" onPointerDown={event => event.stopPropagation()}>
    <span>片段</span>
    <label title="片段播放速度"><Gauge/><PreciseRange ariaLabel="片段速度" min={.5} max={2} step={.05} value={track.clipPlaybackRate} onChange={clipPlaybackRate => onChange({ clipPlaybackRate })}/><output>{track.clipPlaybackRate.toFixed(2)}×</output></label>
    <label title="片段音量"><Volume2/><PreciseRange ariaLabel="片段音量" min={0} max={2} step={.01} value={track.clipVolume} onChange={clipVolume => onChange({ clipVolume })}/><output>{Math.round(track.clipVolume * 100)}%</output></label>
  </div>
}
