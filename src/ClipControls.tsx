import { Gauge, Volume2 } from 'lucide-react'
import type { MixerTrack } from './mixer'
import { presetPitch, voicePresets, type VoicePreset } from './voice-effects'

type Props = { track: MixerTrack; onChange: (patch: Partial<MixerTrack>) => void; onApplyPitch?: () => void }

export default function ClipControls({ track, onChange, onApplyPitch }: Props) {
  if (!track.buffer) return null
  return <div className="clip-controls" onPointerDown={event => event.stopPropagation()}>
    <span>片段</span>
    <label title="片段播放速度"><Gauge/><input type="range" min=".5" max="2" step=".05" value={track.clipPlaybackRate} onChange={event => onChange({ clipPlaybackRate: +event.target.value })}/><output>{track.clipPlaybackRate.toFixed(2)}×</output></label>
    <label title="片段音量"><Volume2/><input type="range" min="0" max="2" step=".01" value={track.clipVolume} onChange={event => onChange({ clipVolume: +event.target.value })}/><output>{Math.round(track.clipVolume * 100)}%</output></label>
    <label className="clip-effect">变声<select value={track.clipVoicePreset} onChange={event => { const preset = event.target.value as VoicePreset; onChange({ clipVoicePreset: preset, clipPitchSemitones: presetPitch[preset] }) }}>{voicePresets.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></label>
    <label className="clip-pitch">半音<input type="range" min="-12" max="12" step="1" value={track.clipPitchSemitones} onChange={event => onChange({ clipPitchSemitones: +event.target.value })}/><output>{track.clipPitchSemitones > 0 ? '+' : ''}{track.clipPitchSemitones}</output></label>
    {onApplyPitch && <button className="clip-apply-pitch" onClick={onApplyPitch}>应用变调</button>}
  </div>
}
