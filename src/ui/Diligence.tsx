import { useState } from 'react'
import { ClipboardList, MapPinned } from 'lucide-react'
import { eiaScreen, fireStairScreen, parkingScreen, type groundScreens, type ProgramFacts, type ReserveKind, type SiteConflict } from '../domain/diligence'
import { area, bounds, type Frame, type Shape } from '../domain/geo'
import { SOURCE, type Program } from '../domain/rules'
import type { Option } from '../domain/solve'
import { fmt, SourceLink } from './Inspector'

export type OverlayView = 'parking' | 'fire' | null
export type Restriction = { kind: ReserveKind; depth: number }
export type SiteInputs = { conflict: SiteConflict; restriction: Restriction }

function NumberField({ label, value, onChange, step = 1, max, disabled }: { label: string; value?: number; onChange: (n: number | undefined) => void; step?: number; max?: number; disabled?: boolean }) {
  return <label className="evidence-field">{label}<input type="number" min="0" step={step} max={max} value={value ?? ''} placeholder="Not entered" disabled={disabled}
    onChange={e => {
      const n = e.currentTarget.valueAsNumber
      onChange(Number.isFinite(n) && n >= 0 && (max === undefined || n <= max) && (step !== 1 || Number.isInteger(n)) ? n : undefined)
    }}/></label>
}
function DiligenceRow({ title, badge, children }: { title: string; badge: string; children: React.ReactNode }) {
  return <details className="diligence-row">
    <summary><strong>{title}</strong><span>{badge}</span></summary>
    <div className="diligence-body">{children}</div>
  </details>
}
export function Diligence({ option, program, frame, site, onSite, reservation, width, onWidth, scan, onScan, ground, locked }:
  { option?: Option; program: Program; frame?: Frame; site: SiteInputs; onSite: (s: SiteInputs) => void; reservation: Shape;
    width: number; onWidth: (n: number) => void; scan: OverlayView; onScan: (s: OverlayView) => void; ground?: ReturnType<typeof groundScreens>; locked: boolean }) {
  const [facts, setFacts] = useState<ProgramFacts>({})
  const set = (key: keyof ProgramFacts) => (n: number | undefined) => setFacts(f => ({ ...f, [key]: n }))
  const count = facts.units === 0 ? undefined : facts.units
  const parking = option ? parkingScreen(program, option.gfa, { ...facts, units: count }) : undefined
  const stair = option ? fireStairScreen(option.floors.length, facts.roofDeckM2) : undefined
  const eia = option ? eiaScreen(program, option.gfa, count, facts.projectUsableM2 || undefined) : undefined
  const shortSide = option && frame ? Math.max(...option.floors.map(fl => {
    const b = bounds(fl.polygon, frame)
    return Math.min(b.d1 - b.d0, b.s1 - b.s0)
  })) : null
  const boxes = ground?.parking.bays.length ?? 0
  return <section className="surface diligence" id="due-diligence" aria-labelledby="diligence-title">
    <div className="surface-head"><div><p className="eyebrow">Past the massing shell</p><h2 id="diligence-title">Due diligence</h2></div><ClipboardList size={21}/></div>
    <p className="diligence-intro">Quick site and code checks to run before calling a surveyor or architect. These stay separate from the massing fit above.</p>
    <DiligenceRow title="Parking" badge={parking?.state === 'trigger' ? 'Trigger flagged' : parking?.state === 'below' ? 'Below this trigger' : 'Brief needed'}>
      {program === 'office' ? <NumberField label="Total working-room area (m²)" value={facts.workroomsM2} onChange={set('workroomsM2')} step={0.01} disabled={locked}/> :
        <div className="diligence-fields"><NumberField label="Project condo units" value={facts.units} onChange={set('units')} disabled={locked}/>
          <NumberField label="Largest unit area (m²)" value={facts.largestUnitM2} onChange={set('largestUnitM2')} step={0.01} disabled={locked}/></div>}
      <p>{program === 'office' ? 'BMA §83(6) triggers at 300 m² of working-room area rather than total GFA. At 300 m² or above, this check uses total GFA as a conservative stand-in for 1 bay per 60 m² (rounded up).' :
        'BMA §83(3) triggers on condo units of 60 m² or larger. This check flags 60 m²+ units and budgets 1 bay per unit; verify mixed unit sizes with the district office.'}</p>
      {option && (program === 'office' ? (facts.workroomsM2 ?? 0) > option.gfa : (facts.largestUnitM2 ?? 0) > option.gfa || (facts.largestUnitM2 ?? 0) === 0 && facts.largestUnitM2 !== undefined) &&
        <p className="screen-result">Check the area input against the active concept and enter a positive unit area.</p>}
      {parking?.count !== undefined && parking.count > 0 && <p className="screen-result">{parking.count} provisional {parking.count === 1 ? 'bay' : 'bays'} to plan for.</p>}
      <button type="button" className="button" disabled={!option || locked} aria-pressed={scan === 'parking'} onClick={() => onScan(scan === 'parking' ? null : 'parking')}><MapPinned size={14}/> {scan === 'parking' ? 'Hide surface parking' : 'Test surface parking'}</button>
      {scan === 'parking' && ground && <p className="screen-result" aria-live="polite">{boxes ? `${boxes} ${boxes === 1 ? 'bay fits' : 'bays fit'} in the tested layout.` : 'No bays found in the tested layout.'}
        {parking?.count && parking.count > boxes ? ` ${parking.count - boxes} short of the provisional target.` : ''}</p>}
      {scan === 'parking' && boxes > 0 && <a href="#site-model">See tested bays on the map ↑</a>}
      <p>Packs 2.4 × 5 m stalls along a 6 m two-way aisle inside the unplanted yard, keeping clear of the entry walk and any rear easement. Does not model turning radii or ground-floor piloti parking.</p>
      <SourceLink to={SOURCE.bma}>Thai BMA ordinance §§83–90</SourceLink>
    </DiligenceRow>
    <DiligenceRow title="Fire access" badge="Geometry screen">
      <p>Checks whether a straight {fmt(width)} m clear lane reaches from the street edge to the front wall. Pick the lane width below.</p>
      <label className="evidence-field">Test clear width ({fmt(width)} m)<input type="range" min="2" max="8" step="0.1" value={width} disabled={locked}
        onChange={e => onWidth(Number(e.target.value))}/></label>
      <button type="button" className="button" disabled={!option || locked} aria-pressed={scan === 'fire'} onClick={() => onScan(scan === 'fire' ? null : 'fire')}><MapPinned size={14}/> {scan === 'fire' ? 'Hide fire approach' : 'Test fire approach'}</button>
      {scan === 'fire' && ground && <p className="screen-result" aria-live="polite">{ground.fire.length ?
        `A ${fmt(width)} m straight approach fits the modeled ground.` : `A ${fmt(width)} m straight approach was not found at the tested façade.`}</p>}
      {scan === 'fire' && Boolean(ground?.fire.length) && <a href="#site-model">See tested route on the map ↑</a>}
      <p>Still verify fire-truck turning, gate clearance, axle-load rating, and nearest hydrant distance with local fire authorities.</p>
    </DiligenceRow>
    <DiligenceRow title="Egress" badge={stair === 'trigger' ? 'Fire stair flagged' : stair === 'below' ? 'Below this trigger' : 'Roof details needed'}>
      <p>MR 55 §27 requires a dedicated fire-escape stair (in addition to the main stair) at 4 or more storeys, or at 3 storeys with a roof deck over 16 m².</p>
      {option?.floors.length === 3 && <NumberField label="Roof deck area (m²)" value={facts.roofDeckM2} onChange={set('roofDeckM2')} step={0.01} disabled={locked}/>}
      <p>Leave floor area for stair cores and protected exits when laying out rooms.</p>
      <SourceLink to={SOURCE.national}>Thai MR 55 §§27–32</SourceLink>
    </DiligenceRow>
    <DiligenceRow title="Structure" badge="Engineer review">
      {shortSide !== null && <p className="screen-result">Deepest short-side floor span: {fmt(shortSide, 2)} m (overall plate width, not column spacing).</p>}
      <p>Stepped upper floors may need transfer beams. Order a soil bore log and structural review for foundations, wind, and adjacent buildings.</p>
    </DiligenceRow>
    <DiligenceRow title="Environmental impact assessment" badge={eia === 'trigger' ? 'Size trigger flagged' : eia === 'below' ? 'Below these triggers' : eia === 'not-applicable' ? 'Condo screen only' : 'Unit count needed'}>
      {program === 'multifamily' && <div className="diligence-fields"><NumberField label="Units across the full project" value={facts.units} onChange={set('units')} disabled={locked}/>
        <NumberField label="Full project usable area (m²)" value={facts.projectUsableM2} onChange={set('projectUsableM2')} step={0.01} disabled={locked}/></div>}
      <p>Thai condo EIA triggers at 80 units or 4,000 m² of usable area. If usable area is left blank, this check uses the active building's GFA as a stand-in. Confirm combined project area and location rules with ONEP.</p>
      <SourceLink to="https://asa.or.th/laws/news20240109/">B.E. 2566 EIA notice and Thai text</SourceLink>
      <SourceLink to="https://eia.onep.go.th/site/eia">ONEP project register</SourceLink>
    </DiligenceRow>
    <DiligenceRow title="Permits" badge="Authority review">
      <p>Bring the land title, surveyed boundaries, road-width proof, and signed architectural and engineering plans to the Saphan Sung district office to confirm the filing track.</p>
      <SourceLink to="https://bmaoss.bangkok.go.th/">BMA permit portal</SourceLink>
    </DiligenceRow>
    <DiligenceRow title="Utilities, easements & overlays" badge={site.restriction.depth ? 'Scenario strip drawn' : 'Records needed'}>
      <p>Map data does not show buried pipes, drainage levels, or title easements. Enter a rear setback depth below to carve a no-build strip out of the back of the plot and watch the solver re-fit.</p>
      <fieldset className="diligence-fields" disabled={locked} aria-label="Hypothetical no-build strip">
        <label className="evidence-field">Reservation type<select value={site.restriction.kind} onChange={e => onSite({ ...site, restriction: { ...site.restriction, kind: e.target.value as ReserveKind } })}>
          <option>Easement</option><option>Utility</option><option>Overlay</option>
        </select></label>
        <NumberField label="Rear no-build depth (m)" max={60} step={0.1} value={site.restriction.depth || undefined}
          onChange={depth => onSite({ ...site, restriction: { ...site.restriction, depth: depth ?? 0 } })}/>
      </fieldset>
      {reservation.length > 0 && <p className="screen-result">{fmt(area(reservation), 2)} m² reserved on the map. Floors and planting stay out of this strip.</p>}
      {reservation.length > 0 && <a href="#site-model">See the no-build strip on the map ↑</a>}
      <p>Measured inward from the deepest rear corner parallel to the street. It stays inside total land and open-ground denominators here unless your legal restriction requires subtracting it.</p>
      <SourceLink to="https://landsmaps.dol.go.th/">Department of Lands parcel lookup</SourceLink>
      <SourceLink to={SOURCE.map}>Source planning sheet</SourceLink>
    </DiligenceRow>
    <DiligenceRow title="Site model assumptions" badge={site.conflict === 'none' ? 'Assumed' : 'Fit withheld'}>
      <ul><li>One straight public road edge with direct entry from the street.</li>
        <li>Flat ground and road at the same level.</li>
        <li>Windows or balconies allowed on all side and rear walls (no blank-wall reductions assumed).</li>
        <li>No rail-station FAR bonus applied.</li></ul>
      <label className="evidence-field">Known mismatch<select value={site.conflict} disabled={locked} onChange={e => onSite({ ...site, conflict: e.target.value as SiteConflict })}>
        <option value="none">None entered (assumptions unverified)</option><option value="frontage">Private, curved or multiple frontages</option>
        <option value="grade">Road or site is not flat</option><option value="overlay">Known restriction not modeled by a rear strip</option>
      </select></label>
    </DiligenceRow>
  </section>
}
