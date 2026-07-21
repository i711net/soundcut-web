import { Check, CopyPlus, Headphones, Minus, Plus, Trash2, Volume2, VolumeX } from 'lucide-react'
import type { MixerTrack } from './mixer'
import { presetPitch, voicePresets, type VoicePreset } from './voice-effects'

type Props = { track: MixerTrack; active: boolean; onActivate: () => void; onChange: (patch: Partial<MixerTrack>) => void; onExtract?: () => void; onDelete?: () => void; onApplyPitch?: () => void }

export default function TrackControls({ track, active, onActivate, onChange, onExtract, onDelete, onApplyPitch }: Props) {
  return <div className={`track-controls ${active ? 'active' : ''}`} onClick={onActivate}>
    <span className="track-number">{track.kind === 'video' ? 'V' : track.id.replace(/\D/g, '') || 'A'}</span>
    <strong>{track.name}</strong>
    <div className="track-switches">
      <button className={track.muted ? 'selected' : ''} aria-pressed={track.muted} title="静音" onClick={e => { e.stopPropagation(); onChange({ muted: !track.muted }) }}>{track.muted ? <VolumeX/> : <Volume2/>}<span>M</span></button>
      <button className={track.solo ? 'selected solo' : ''} aria-pressed={track.solo} title="独奏；可同时选择多条" onClick={e => { e.stopPropagation(); onChange({ solo: !track.solo }) }}><Headphones/><span>S</span></button>
      <button className={track.includeInExport ? 'selected export-on' : ''} aria-pressed={track.includeInExport} title="参与混合导出" onClick={e => { e.stopPropagation(); onChange({ includeInExport: !track.includeInExport }) }}><Check/><span>导出</span></button>
    </div>
    <label className="track-volume">音量<input type="range" min="0" max="2" step=".01" value={track.volume} onClick={e => e.stopPropagation()} onChange={e => onChange({ volume: +e.target.value })}/><output>{Math.round(track.volume * 100)}%</output></label>
    <label className="track-volume">速度<input type="range" min=".5" max="2" step=".05" value={track.playbackRate} onClick={e => e.stopPropagation()} onChange={e => onChange({ playbackRate: +e.target.value })}/><output>{track.playbackRate.toFixed(2)}×</output></label>
    <label className="track-effect">变声<select value={track.voicePreset} onClick={e => e.stopPropagation()} onChange={e => { const preset = e.target.value as VoicePreset; onChange({ voicePreset: preset, pitchSemitones: presetPitch[preset] }) }}>{voicePresets.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></label>
    <label className="track-pitch">半音<input type="range" min="-12" max="12" step="1" value={track.pitchSemitones} onClick={e => e.stopPropagation()} onChange={e => onChange({ pitchSemitones: +e.target.value })}/><output>{track.pitchSemitones > 0 ? '+' : ''}{track.pitchSemitones}</output></label>
    <div className="track-row-actions">
      <button title={track.expanded ? '收起编辑区' : '铺开编辑区'} onClick={e => { e.stopPropagation(); onChange({ expanded: !track.expanded }) }}>{track.expanded ? <Minus/> : <Plus/>}<span>{track.expanded ? '收起' : '铺开'}</span></button>
      {onDelete && <button className="delete-track" title="删除轨道" onClick={e => { e.stopPropagation(); onDelete() }}><Trash2/><span>删除</span></button>}
    </div>
    {onApplyPitch && <button className="apply-pitch" onClick={e => { e.stopPropagation(); onApplyPitch() }}>生成变调</button>}
    {onExtract && <button className="extract-track" onClick={e => { e.stopPropagation(); onExtract() }}><CopyPlus/>提取到主音轨</button>}
  </div>
}
