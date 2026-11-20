import { ArrowLeft, ArrowRight, ArrowRightLeft, Compass, X } from 'lucide-react'
import { CONCEPT, type ConceptKind } from '../domain/concepts'
import { siteFrame, type Frontage, type Slice } from '../domain/envelope'
import { bounds, type Frame, type Ring, type Shape } from '../domain/geo'
import type { Option } from '../domain/solve'
import type { RuleId } from '../domain/rules'
import { fmt } from './Inspector'

export type WalkthroughState = { step: number; alternate: boolean; probe?: number | null; rule?: RuleId | null }
const steps = [
  ['Start with the site', 'You are looking at Soi Ramkhamhaeng 144 in Saphan Sung, surrounded by 559 mapped building footprints. The plot boundary and 6 m road width are starting assumptions you can edit.'],
  ['Compare the trade-off', 'Flip between two massings from the same camera angle. Stepping down one floor to get a terrace spreads the lower plates and eats into the open yard.'],
  ['See the road set the height', 'Bangkok caps height at twice the distance from the opposite side of the road. Widen the road from 6 m to 12 m and watch the 21 m slice step forward.'],
  ['Find the office threshold', 'In ย.3, a standalone office is capped at 300 m² on narrow streets, jumping to 500 m² once the public right-of-way reaches 16 m. Base FAR stays 2.5×.'],
] as const
export function Walkthrough({ tour, onStep, onToggle, onClose, area, width, slice, use, far }:
  { tour: WalkthroughState; onStep: (n: number) => void; onToggle: () => void; onClose: () => void;
    area: number; width: number; slice?: Slice; use: number; far: number }) {
  const [title, description] = steps[tour.step]
  return <section className="walkthrough" aria-labelledby="walkthrough-title">
    <div className="walk-content" aria-live="polite">
      <p className="eyebrow"><Compass size={14}/> Guided demo <span>{tour.step + 1} / {steps.length}</span><span>Temporary example</span></p>
      <h2 id="walkthrough-title">{title}</h2>
      <p>{description}</p>
    </div>
    <div className="walk-details">
      {tour.step === 0 && <div className="walk-stat"><strong>{fmt(area, 2)} m²</strong> illustrative plot · {fmt(width)} m assumed ROW</div>}
      {tour.step === 1 && <button type="button" className="button" onClick={onToggle}><ArrowRightLeft size={14}/> Show {tour.alternate ? 'Garden Bar' : 'Stepped Court'}</button>}
      {tour.step === 2 && <>
        <div className="walk-stat" aria-live="polite"><strong>{fmt(width)} m ROW</strong>{slice && <> · <strong>{fmt(slice.frontM, 2)} m</strong> minimum depth at {fmt(slice.topM)} m</>}</div>
        <button type="button" className="button" onClick={onToggle}>Try {tour.alternate ? '6' : '12'} m ROW</button>
        <a href="#road-section" className="text-button">See section <ArrowRight size={13}/></a>
      </>}
      {tour.step === 3 && <>
        <div className="walk-stat" aria-live="polite"><strong>{fmt(use)} m² use cap</strong> · {fmt(far)} m² base FAR</div>
        <button type="button" className="button" onClick={onToggle}>Try {tour.alternate ? '15.99' : '16'} m ROW</button>
      </>}
    </div>
    <div className="walk-nav">
      <button className="button" type="button" disabled={!tour.step} onClick={() => onStep(tour.step - 1)} aria-label="Previous demo step"><ArrowLeft size={16}/></button>
      <button className="button primary" type="button" onClick={() => tour.step === steps.length - 1 ? onClose() : onStep(tour.step + 1)}>
        {tour.step === steps.length - 1 ? 'Finish demo' : 'Next step'} <ArrowRight size={15}/>
      </button>
      <button className="button" type="button" onClick={onClose} aria-label="Exit guided demo" title="Exit guided demo"><X size={16}/></button>
    </div>
  </section>
}

function planPath(shape: Shape, f: Frame, box: ReturnType<typeof bounds>, close = true) {
  const scale = Math.min(126 / (box.s1 - box.s0), 68 / (box.d1 - box.d0))
  return shape.flatMap(p => p.map(r => r.map((p, i) => {
    const [s, d] = f.into(p)
    const x = 80 + (s - (box.s0 + box.s1) / 2) * scale, y = 45 - (d - (box.d0 + box.d1) / 2) * scale
    return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ') + (close ? 'Z' : ''))).join(' ')
}
function delta(n: number, unit: string) {
  const value = Math.round(n * 10) / 10
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${fmt(Math.abs(value))}${unit ? ` ${unit}` : ''}`
}
export function Comparison({ options, active, plot, frontage, onSelect, locked }:
  { options: [Option, Option]; active: ConceptKind; plot: Ring; frontage: Frontage; onSelect: (k: ConceptKind) => void; locked: boolean }) {
  const basis = siteFrame(plot, frontage)
  if (!basis) return null
  const { f } = basis, box = bounds([[plot]], f)
  const parcel = planPath([[plot]], f, box)
  const [a, b] = options
  return <section className="compare-panel" aria-label="Same-scale concept comparison">
    <div className="compare-head"><strong>Same plot, same scale</strong><span>{CONCEPT[b.kind].letter} minus {CONCEPT[a.kind].letter}</span></div>
    <dl className="compare-deltas">
      <div><dt>Gross floor area</dt><dd>{delta(b.gfa - a.gfa, 'm²')}</dd></div>
      <div><dt>Height</dt><dd>{delta(b.h - a.h, 'm')}</dd></div>
      <div><dt>Open ground</dt><dd>{delta(b.open - a.open, 'm²')}</dd></div>
    </dl>
    <div className="compare-plans">
      {options.map(o => <button key={o.kind} className="compare-plan" type="button" disabled={locked} onClick={() => onSelect(o.kind)} aria-label={`View ${CONCEPT[o.kind].name} in the same camera`} aria-pressed={o.kind === active}>
        <svg viewBox="0 0 160 92" aria-hidden="true">
          <path d={parcel} fill="#ecece2" stroke="#8a8e7d" strokeWidth="1"/>
          <path d={planPath(o.plantedGeometry, f, box)} fill="#a5b48b" fillRule="evenodd"/>
          <path d={planPath(o.covered, f, box)} fill="#bd825e" stroke="#a26344" strokeWidth="1" fillRule="evenodd"/>
          <path d={planPath(o.floors.at(-1)!.polygon, f, box)} fill="#8f482f" fillRule="evenodd"/>
          <path d={planPath([[[frontage.a, frontage.b]]], f, box, false)} stroke="#47849a" strokeWidth="2" strokeDasharray="3 2"/>
        </svg>
        <span>{CONCEPT[o.kind].letter} · {CONCEPT[o.kind].name}</span>
      </button>)}
    </div>
    <p>Plans show roof plate, ground footprint, and planted yard at the same scale. The dashed line on the 3D map marks the other design's ground footprint.</p>
  </section>
}
