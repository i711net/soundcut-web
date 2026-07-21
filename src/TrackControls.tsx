import { Check, CopyPlus, Headphones, Volume2, VolumeX } from 'lucide-react'
import type { MixerTrack } from './mixer'

type Props = { track: MixerTrack; active: boolean; onActivate: () => void; onChange: (patch: Partial<MixerTrack>) => void; onExtract?: () => void }

export default function TrackControls({ track, active, onActivate, onChange, onExtract }: Props) {
  return <div className={`track-controls ${active ? 'active' : ''}`} onClick={onActivate}>
    <span className="track-number">{track.kind === 'video' ? 'V' : track.id.replace(/\D/g, '') || 'A'}</span>
    <strong>{track.name}</strong>
    <div className="track-switches">
      <button className={track.muted ? 'selected' : ''} aria-pressed={track.muted} title="静音" onClick={e => { e.stopPropagation(); onChange({ muted: !track.muted }) }}>{track.muted ? <VolumeX/> : <Volume2/>}<span>M</span></button>
      <button className={track.solo ? 'selected solo' : ''} aria-pressed={track.solo} title="独奏；可同时选择多条" onClick={e => { e.stopPropagation(); onChange({ solo: !track.solo }) }}><Headphones/><span>S</span></button>
      <button className={track.includeInExport ? 'selected export-on' : ''} aria-pressed={track.includeInExport} title="参与混合导出" onClick={e => { e.stopPropagation(); onChange({ includeInExport: !track.includeInExport }) }}><Check/><span>导出</span></button>
    </div>
    <label className="track-volume">音量<input type="range" min="0" max="2" step=".01" value={track.volume} onClick={e => e.stopPropagation()} onChange={e => onChange({ volume: +e.target.value })}/><output>{Math.round(track.volume * 100)}%</output></label>
    {onExtract && <button className="extract-track" onClick={e => { e.stopPropagation(); onExtract() }}><CopyPlus/>提取到主音轨</button>}
  </div>
}
