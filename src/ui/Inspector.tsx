import { ArrowUpRight, Check, ChevronRight, ExternalLink, Info } from 'lucide-react'
import { CONCEPT } from '../domain/concepts'
import { RULE, SOURCE, type RuleId } from '../domain/rules'
import type { Option, Result } from '../domain/solve'

export const fmt = (n: number, digits = 1) => Number.isFinite(n) ? new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(n) : '—'
export function SourceLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <a href={to} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={13}/></a>
}
export function Inspector({ result, option, rule, onRule, selected, onSelect, stale, locked }:
  { result: Result; option?: Option; rule: RuleId | null; onRule: (r: RuleId) => void; selected: number | null; onSelect: (i: number | null) => void; stale: boolean; locked: boolean }) {
  function displayed(n: number, unit: string) { return unit === '× perimeter' ? `${fmt(n * 100, 2)}%` : `${fmt(n, 3)}${unit ? ` ${unit}` : ''}` }
  return <section className="surface inspector" id="rules" aria-labelledby="rules-title">
    <div className="surface-head"><div><p className="eyebrow">Rulebook · B.E. 2556 / 2569</p><h2 id="rules-title">Rules &amp; floor ledger</h2></div>
      {!stale && option && <span className="soft-pill"><Check size={14}/> {option.checks.length} modeled checks</span>}</div>
    {result.scopeStatus === 'supported' && !stale && <div className="budgets">
      {([['Base FAR · 2.5×', result.ruleTrace.far, 'Z-FAR'], ['Use allowance', result.ruleTrace.use, 'Z-USE'], ['Study ceiling', result.ruleTrace.study, 'STUDY-GFA']] as const)
        .map(([label, n, id]) => <button type="button" key={label} onClick={() => onRule(id)}><span>{label}</span><strong>{fmt(n)} <small>m²</small></strong></button>)}
    </div>}
    {option && !stale && <div className="ledger"><div className="ledger-title"><strong>{CONCEPT[option.kind].name} · floor ledger</strong><button type="button" className="text-button" disabled={locked} onClick={() => onSelect(null)}>All floors</button></div>
      <div className="floor-grid">
        {option.floors.map((floor, i) => <button type="button" aria-label={`Inspect floor ${i + 1}`} aria-pressed={selected === i + 1} key={i} onClick={() => onSelect(selected === i + 1 ? null : i + 1)} disabled={locked}>
          <span>F{i + 1} <small>{floor.topM} m top</small></span><strong>{fmt(floor.areaM2, 2)} m²</strong>
        </button>)}
      </div><p>Measured sum: <strong>{fmt(option.gfa, 2)} m²</strong> (table values rounded).</p>
    </div>}
    {(!option || stale) && <p className="section-empty">No active massing to score right now. You can still read the rules and Thai source clauses below.</p>}
    <div className="rule-list">
      {(Object.keys(RULE) as RuleId[]).filter(id => !['B-REAR', 'RESERVE'].includes(id) || option?.checks.some(c => c.id === id) || rule === id).map(id => {
        const rc = RULE[id], check = !stale ? option?.checks.find(c => c.id === id) : undefined
        return <div key={id} id={`rule-${id}`} className={`rule-item ${rule === id ? 'expanded' : ''}`}>
          <button type="button" aria-expanded={rule === id} onClick={() => onRule(id)} className="rule-button">
            {check?.status === 'pass' ? <Check size={15} className="check-icon"/> : <Info size={15} className={check ? 'fail-icon' : 'info-icon'}/>}
            <span>{rc.name}</span>
            {check && <small>{id === 'FORM' ? 'Pass' : displayed(check.actual, check.unit)}</small>}<ChevronRight size={15}/>
          </button>
          {rule === id && <div className="rule-body">
            <span className="rule-kind">{rc.kind} · {id}</span><p>{rc.text}</p>
            {check && <p>{check.reason}{check.floor ? ` Governing check: floor ${check.floor}.` : ''}</p>}
            {check && id !== 'FORM' && <dl><div><dt>Measured</dt><dd>{displayed(check.actual, check.unit)}</dd></div>
              <div><dt>{check.relation === 'less' ? 'Strictly below' : check.relation === 'greater' ? 'Strictly above' : check.relation === 'min' ? 'Minimum' : 'Maximum'}</dt><dd>{displayed(check.threshold, check.unit)}</dd></div>
              <div><dt>{check.status === 'pass' ? 'Slack' : 'Shortfall'}</dt><dd>{displayed(Math.abs(check.slack), check.unit)}</dd></div></dl>}
            <div className="source-links">{rc.refs.map(([label, href]) => <SourceLink key={label} to={href}>{label} · Thai text</SourceLink>)}<a href={`#rule-${id}`}>Link to this rule</a></div>
          </div>}
        </div>
      })}
    </div>
  </section>
}
export function DataNotes() {
  return <section className="surface data-panel" id="data" aria-labelledby="data-title">
    <div className="surface-head"><div><p className="eyebrow">Sources &amp; limits</p><h2 id="data-title">Where the data comes from</h2></div><ExternalLink size={18}/></div>
    <dl className="data-list">
      <div><dt>Study area</dt><dd>Saphan Sung, Bangkok, inside the ย.3-36 block on the B.E. 2556 land-use map (Sheet 8). The dashed box on the map bounds this local extract; it is not an official zoning boundary.</dd></div>
      <div><dt>Streets</dt><dd>94 road centerlines from OpenStreetMap (ODbL 1.0). Centerlines are mapped; legal right-of-way width and public road status come from your input.</dd></div>
      <div><dt>Buildings</dt><dd>559 building footprints from Overture Maps (release 2026-11-18.0: 380 Google Open Buildings, 177 Microsoft ML, 2 OSM). Because none carry height data, neighbors render at a uniform 6 m.</dd></div>
      <div><dt>Due diligence</dt><dd><a href="#due-diligence">Jump to the site screens above.</a> Passing the massing geometry does not clear parking, fire access, structural engineering, EIA, or buried utilities.</dd></div>
    </dl>
    <div className="source-links data-links">
      <SourceLink to={SOURCE.map}>Planning map, sheet 8</SourceLink><SourceLink to={SOURCE.amendment}>2569 amendment</SourceLink>
      <SourceLink to="https://www.openstreetmap.org/copyright">OSM copyright / ODbL</SourceLink>
      <SourceLink to="https://docs.overturemaps.org/attribution/#buildings">Overture attribution</SourceLink>
      <SourceLink to="https://sites.research.google/gr/open-buildings/">Google Open Buildings</SourceLink>
      <SourceLink to="https://github.com/microsoft/GlobalMLBuildingFootprints">Microsoft footprints</SourceLink>
      <SourceLink to="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</SourceLink>
    </div>
  </section>
}
