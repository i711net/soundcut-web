type Props = { min: number; max: number; step: number; value: number; onChange: (value: number) => void; ariaLabel?: string }

export default function PreciseRange({ min, max, step, value, onChange, ariaLabel }: Props) {
  const decimals = Math.max(0, (String(step).split('.')[1] || '').length)
  const change = (direction: -1 | 1) => onChange(Math.max(min, Math.min(max, Number((value + direction * step).toFixed(decimals)))))
  return <span className="precise-range"><button type="button" aria-label={`${ariaLabel || '数值'}减小`} disabled={value <= min} onClick={event => { event.stopPropagation(); change(-1) }}>−</button><input aria-label={ariaLabel} type="range" min={min} max={max} step={step} value={value} onClick={event => event.stopPropagation()} onChange={event => onChange(+event.target.value)}/><button type="button" aria-label={`${ariaLabel || '数值'}增加`} disabled={value >= max} onClick={event => { event.stopPropagation(); change(1) }}>＋</button></span>
}
