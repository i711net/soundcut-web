import { ClipboardPaste, Copy, FilePlus2, FlipHorizontal2, Merge, Scissors, Sparkles, Split, Trash2, VolumeX, Waves } from 'lucide-react'
import type { ReactNode } from 'react'
import { voicePresets, type VoicePreset } from './voice-effects'

type Props = {
  disabled: boolean
  canPaste: boolean
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
  onTrim: () => void
  onSplit: () => void
  onDuplicate: () => void
  onImport: () => void
  onMerge: () => void
  onSilence: () => void
  onReverse: () => void
  onNormalize: () => void
  onFadeIn: () => void
  onFadeOut: () => void
  effectScope: 'clip' | 'track'
  voicePreset: VoicePreset
  pitchSemitones: number
  onEffectScope: (scope: 'clip' | 'track') => void
  onVoicePreset: (preset: VoicePreset) => void
  onPitchSemitones: (value: number) => void
  onApplyPitch: () => void
}

export default function AudioEditToolbar(props: Props) {
  const button = (label: string, icon: ReactNode, action: () => void, disabled = props.disabled) => <button type="button" title={label} aria-label={label} disabled={disabled} onClick={action}>{icon}<span>{label}</span></button>
  return <section className="audio-edit-toolbar" aria-label="音频剪辑工具">
    <div className="edit-toolbar-title"><strong>音频剪辑</strong><span>选择波形区间后操作</span></div>
    <div className="edit-tool-group">{button('剪切', <Scissors/>, props.onCut)}{button('复制', <Copy/>, props.onCopy)}{button('粘贴', <ClipboardPaste/>, props.onPaste, props.disabled || !props.canPaste)}{button('删除', <Trash2/>, props.onDelete)}{button('保留选区', <Waves/>, props.onTrim)}</div>
    <div className="edit-tool-group">{button('打开媒体', <FilePlus2/>, props.onImport, false)}{button('在播放头分割', <Split/>, props.onSplit)}{button('复制为新轨', <FilePlus2/>, props.onDuplicate)}{button('合并所选轨道', <Merge/>, props.onMerge)}</div>
    <div className="edit-tool-group effects">{button('选区静音', <VolumeX/>, props.onSilence)}{button('反转', <FlipHorizontal2/>, props.onReverse)}{button('标准化', <Sparkles/>, props.onNormalize)}{button('淡入', <Waves/>, props.onFadeIn)}{button('淡出', <Waves/>, props.onFadeOut)}</div>
    <div className="central-voice-controls"><label>作用范围<select value={props.effectScope} onChange={event => props.onEffectScope(event.target.value as 'clip' | 'track')}><option value="clip">当前片段</option><option value="track">当前音轨</option></select></label><label>变声<select value={props.voicePreset} onChange={event => props.onVoicePreset(event.target.value as VoicePreset)}>{voicePresets.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></label><label>变调 <b>{props.pitchSemitones > 0 ? '+' : ''}{props.pitchSemitones}</b><input type="range" min="-12" max="12" step="1" value={props.pitchSemitones} onChange={event => props.onPitchSemitones(+event.target.value)}/></label><button type="button" className="apply-central-pitch" disabled={props.disabled} onClick={props.onApplyPitch}><Sparkles/><span>应用变调</span></button></div>
  </section>
}
