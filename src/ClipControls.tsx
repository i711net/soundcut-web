import { Gauge, Volume2, WandSparkles } from 'lucide-react'
import type { AudioClip } from './mixer'
import { voicePresets } from './voice-effects'
import PreciseRange from './PreciseRange'

type Props = { clip: AudioClip; onChange: (patch: Partial<AudioClip>) => void; onApplyPitch: () => void; pitchWorking?: boolean }

export default function ClipControls({ clip, onChange, onApplyPitch, pitchWorking = false }: Props) {
  const maxDuration = Math.max(.02, clip.buffer.duration - clip.offset)
  return <div className="clip-controls clip-properties" onPointerDown={event => event.stopPropagation()}>
    <label title="时间伸缩：改变速度但保持音高"><Gauge/><span>速度</span><PreciseRange ariaLabel="当前片段保调速度" min={.25} max={4} step={.01} value={clip.timeStretchRate || 1} onChange={timeStretchRate => onChange({ timeStretchRate })}/><output>{(clip.timeStretchRate || 1).toFixed(2)}×</output></label>
    <button className="apply-stretch" onClick={onApplyPitch} disabled={pitchWorking}>{pitchWorking ? '处理中…' : `应用速度并保持音高${clip.appliedTimeStretchRate !== clip.timeStretchRate ? ' *' : ''}`}</button>
    <label title="片段音量"><Volume2/><span>音量</span><PreciseRange ariaLabel="当前片段音量" min={0} max={2} step={.01} value={clip.volume} onChange={volume => onChange({ volume })}/><output>{Math.round(clip.volume * 100)}%</output></label>
    <div className="clip-number-grid">
      <label>时间线位置<input type="number" min="0" step="0.01" value={clip.start.toFixed(2)} onChange={event => onChange({ start: Math.max(0, Number(event.target.value) || 0) })}/><small>秒</small></label>
      <label>音频入点<input type="number" min="0" max={clip.buffer.duration} step="0.01" value={clip.offset.toFixed(2)} onChange={event => { const offset = Math.max(0, Math.min(clip.buffer.duration - .02, Number(event.target.value) || 0)); onChange({ offset, duration: Math.min(clip.duration, clip.buffer.duration - offset) }) }}/><small>秒</small></label>
      <label>源片段长度<input type="number" min="0.02" max={maxDuration} step="0.01" value={clip.duration.toFixed(2)} onChange={event => onChange({ duration: Math.max(.02, Math.min(maxDuration, Number(event.target.value) || .02)) })}/><small>秒</small></label>
      <label>播放后长度<input readOnly value={(clip.duration / clip.playbackRate).toFixed(2)}/><small>秒</small></label>
    </div>
    <div className="clip-number-grid fades">
      <label>淡入<input type="number" min="0" max={clip.duration / clip.playbackRate} step="0.05" value={clip.fadeIn.toFixed(2)} onChange={event => onChange({ fadeIn: Math.max(0, Number(event.target.value) || 0) })}/><small>秒</small></label>
      <label>淡出<input type="number" min="0" max={clip.duration / clip.playbackRate} step="0.05" value={clip.fadeOut.toFixed(2)} onChange={event => onChange({ fadeOut: Math.max(0, Number(event.target.value) || 0) })}/><small>秒</small></label>
    </div>
    <label className="clip-select"><WandSparkles/><span>变声</span><select value={clip.voicePreset} onChange={event => onChange({ voicePreset: event.target.value as AudioClip['voicePreset'] })}>{voicePresets.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></label>
    <div className="clip-pitch"><label>音高 <output>{clip.pitchSemitones > 0 ? '+' : ''}{clip.pitchSemitones} 半音</output><PreciseRange ariaLabel="当前片段音高" min={-12} max={12} step={1} value={clip.pitchSemitones} onChange={pitchSemitones => onChange({ pitchSemitones })}/></label><button onClick={onApplyPitch} disabled={pitchWorking}>{pitchWorking ? '处理中…' : clip.pitchSemitones ? '应用片段音高' : '恢复片段原音高'}</button></div>
  </div>
}
