import { ClipboardPaste, Copy, FilePlus2, FlipHorizontal2, Merge, Scissors, Sparkles, Split, Trash2, VolumeX, Waves } from 'lucide-react'
import type { ReactNode } from 'react'

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
}

export default function AudioEditToolbar(props: Props) {
  const button = (label: string, icon: ReactNode, action: () => void, disabled = props.disabled) => <button type="button" title={label} aria-label={label} disabled={disabled} onClick={action}>{icon}<span>{label}</span></button>
  return <section className="audio-edit-toolbar" aria-label="音频剪辑工具">
    <div className="edit-toolbar-title"><strong>音频剪辑</strong><span>选择波形区间后操作</span></div>
    <div className="edit-tool-group">{button('剪切', <Scissors/>, props.onCut)}{button('复制', <Copy/>, props.onCopy)}{button('粘贴', <ClipboardPaste/>, props.onPaste, props.disabled || !props.canPaste)}{button('删除', <Trash2/>, props.onDelete)}{button('保留选区', <Waves/>, props.onTrim)}</div>
    <div className="edit-tool-group">{button('在播放头分割', <Split/>, props.onSplit)}{button('复制为新轨', <FilePlus2/>, props.onDuplicate)}{button('导入片段', <FilePlus2/>, props.onImport)}{button('合并所选轨道', <Merge/>, props.onMerge)}</div>
    <div className="edit-tool-group effects">{button('选区静音', <VolumeX/>, props.onSilence)}{button('反转', <FlipHorizontal2/>, props.onReverse)}{button('标准化', <Sparkles/>, props.onNormalize)}{button('淡入', <Waves/>, props.onFadeIn)}{button('淡出', <Waves/>, props.onFadeOut)}</div>
  </section>
}
