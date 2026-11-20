import { ArrowUpRight } from 'lucide-react'
import type { Slice } from '../domain/envelope'
import { bounds, type Ring } from '../domain/geo'
import type { Option } from '../domain/solve'
import { maxSkyHeight, type RuleId } from '../domain/rules'
import { fmt } from './Inspector'
import { intervals, type roadSection } from './sectionGeometry'

export function Section({ plot, cut, width, slices, option, selected, envelope, rule, onRule, probe, onProbe }:
  { plot: Ring; cut: ReturnType<typeof roadSection>; width: number; slices: Slice[]; option?: Option; selected: number | null;
    envelope: boolean; rule: RuleId | null; onRule: (id: RuleId) => void; probe: number | null; onProbe: (d: number | null) => void }) {
  const slice = slices[selected === null ? slices.length - 1 : selected - 1]
  const f = cut?.f, b = f ? bounds([[plot]], f) : null
  const maxD = Math.max(12, (b?.d1 ?? 0) + 2), span = width + maxD
  const scale = Math.min(9.5, 410 / span, 126 / Math.max(21, (slice?.topM ?? 21) + 3))
  const x = (d: number) => 295 + (d - (maxD - width) / 2) * scale, y = (z: number) => 158 - z * scale
  const station = cut?.station ?? 0
  const allowed = probe === null ? 0 : maxSkyHeight(width, probe)
  const front = slice ? [['Street setback', slice.roadM], ['All-round clearance', slice.ringM], ['Road height plane', slice.skyM]]
    .filter(([, n]) => n === slice.frontM).map(([label]) => label).join(' + ') : ''
  return <section className="surface section-panel" id="road-section" aria-labelledby="section-title">
    <div className="surface-head"><div><p className="eyebrow">Spatial limits</p><h2 id="section-title">Road section</h2></div>
      <button type="button" className="text-button" onClick={() => onRule('B/N-SKY')}>2:1 height rule <ArrowUpRight size={14}/></button></div>
    {!f || !slice || !Number.isFinite(width) ? <p className="section-empty">Pick a valid plot and street edge to cut a cross-section through the road.</p> :
      <>
        <svg className="section-svg" viewBox="0 0 590 204" role="img" aria-label={`Road section from the opposite ROW edge, with ${width} metre width and a two-to-one height plane`}>
          <defs><pattern id="section-grid" width="17" height="17" patternUnits="userSpaceOnUse"><path d="M 17 0 L 0 0 0 17" fill="none" stroke="#eae7df" strokeWidth="1"/></pattern></defs>
          <rect width="590" height="158" fill="url(#section-grid)"/>
          <rect x={x(-width)} width={width * scale} y="158" height="12" fill="#d9e7ee"/>
          <line x1="26" x2="563" y1="158" y2="158" stroke="#99988d" strokeWidth="1"/>
          <line x1={x(0)} x2={x(0)} y1="40" y2="171" stroke="#9db0ba" strokeDasharray="4 3" />
          <line x1={x(-width)} x2={x(-width)} y1="134" y2="173" stroke="#59829a" />
          {envelope && slices.filter(s => selected === null || s.level === selected).flatMap(s => intervals(s.polygon, f.into, station).map(([start, end], i) =>
            <rect key={`e${s.level}-${i}`} x={x(start)} y={y(s.topM)} width={(end - start) * scale} height={(s.topM - s.baseM) * scale} fill="#d7e7ef" stroke="#78a4ba" strokeDasharray="3 2"/>))}
          {option?.floors.flatMap((fl, j) => intervals(fl.polygon, f.into, station).map(([start, end], i) =>
            <rect key={`${j}-${i}`} x={x(start)} y={y(fl.topM)} width={(end - start) * scale} height={(fl.topM - fl.baseM) * scale}
              fill={selected === j + 1 ? '#ad532e' : '#cc9170'} stroke="#f6ecdf" strokeWidth="1.2"/>))}
          <line x1={x(-width)} y1={y(0)} x2={x(-width + 65 / scale)} y2={y(130 / scale)}
            stroke={rule === 'B/N-SKY' ? '#23688e' : '#56829a'} strokeDasharray="5 3" strokeWidth={rule === 'B/N-SKY' ? 2.7 : 1.6}/>
          <text x={x(-width + 65 / scale) + 5} y="23" fill="#426779">2:1 plane</text>
          <line x1={x(slice.frontM)} x2={x(slice.frontM)} y1="150" y2={y(slice.topM)} stroke="#8d684e" strokeDasharray="2 3"/>
          {probe !== null && <>
            <line x1={x(probe)} x2={x(probe)} y1="158" y2={Math.max(16, y(allowed))} stroke="#086969" strokeDasharray="3 3" strokeWidth="1.7"/>
            <circle cx={x(probe)} cy="158" r="4" fill="#086969" stroke="#fff" strokeWidth="1.5"/>
            {y(allowed) >= 16 ? <circle cx={x(probe)} cy={y(allowed)} r="4" fill="#086969" stroke="#fff" strokeWidth="1.5"/> :
              <path d={`M ${x(probe) - 4},20 l 4,-5 l 4,5`} stroke="#086969" strokeWidth="1.7" fill="none"/>}
          </>}
          <text x={x(-width) - 6} y="184" textAnchor="end">Opposite ROW</text>
          <text x={x(0) + 7} y="184">Near ROW / plot edge</text>
          <text x={(x(-width) + x(0)) / 2} y="201" textAnchor="middle" fill="#3b6881">{width} m ROW</text>
        </svg>
        <p className="section-foot">At <strong>{slice.topM} m</strong>, the floor steps back <strong>{slice.frontM.toFixed(2)} m</strong> from the front boundary. Governing rule: <strong>{front}</strong>.</p>
        {cut && cut.maxDepth > 0 && <div className="probe">
          <div className="probe-head"><div><strong>Height probe</strong><p>Slide along the cut to test the 2:1 road-plane height at any depth.</p></div>
            <button type="button" className="button" aria-pressed={probe !== null} onClick={() => onProbe(probe === null ? Math.min(3, cut.maxDepth) : null)}>{probe === null ? 'Show probe' : 'Hide probe'}</button></div>
          {probe !== null && <>
            <label htmlFor="probe-depth">Depth from near ROW <strong>{fmt(probe)} m</strong></label>
            <input type="range" id="probe-depth" aria-valuetext={`${fmt(probe)} m inside the plot`} min="0" max={cut.maxDepth} step="0.1" value={probe} onChange={e => onProbe(Number(e.target.value))}/>
            <output htmlFor="probe-depth"><strong>{fmt(allowed, 2)} m road-plane height</strong><span>2 × ({fmt(width, 2)} m ROW + {fmt(probe)} m depth). Setbacks and the 23 m ceiling still apply.{y(allowed) < 16 ? ' Above the chart scale.' : ''}</span></output>
          </>}
        </div>}
      </>}
  </section>
}
