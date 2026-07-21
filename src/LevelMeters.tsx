import type { MeterState } from './useMixerPlayback'
import type { MixerTrack } from './mixer'

const percent = (value: number) => `${Math.min(100, Math.max(0, value * 100))}%`
const db = (value: number) => value > .00001 ? `${(20 * Math.log10(value)).toFixed(1)} dB` : '−∞ dB'

function StereoMeter({ left, right, clipping }: { left: number; right: number; clipping?: boolean }) {
  return <div className={`stereo-meter ${clipping ? 'clipping' : ''}`} title={`左 ${db(left)} · 右 ${db(right)}`}><i><b style={{ width: percent(left) }}/></i><i><b style={{ width: percent(right) }}/></i></div>
}

export default function LevelMeters({ tracks, meters }: { tracks: MixerTrack[]; meters: MeterState }) {
  return <section className="level-meters"><div className="meter-heading"><strong>实时电平</strong><span>{meters.limiterReduction < -.1 ? `限幅 ${meters.limiterReduction.toFixed(1)} dB` : '防爆音已开启'}</span></div><div className="master-meter"><label>主输出</label><StereoMeter left={meters.master.left} right={meters.master.right} clipping={meters.clipping}/><output>{db(Math.max(meters.master.left, meters.master.right))}</output></div><div className="track-meter-list">{tracks.filter(track => track.clips.length).map(track => { const meter = meters.tracks[track.id] || { left: 0, right: 0 }; return <div key={track.id}><label title={track.name}>{track.name}</label><StereoMeter left={meter.left} right={meter.right} clipping={Math.max(meter.left, meter.right) >= 1}/></div> })}</div>{meters.clipping && <div className="clip-warning">输入过响 · 限幅器正在保护输出</div>}</section>
}
