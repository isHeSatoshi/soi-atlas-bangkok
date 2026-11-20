import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownRight, ArrowRight, ArrowRightLeft, ArrowUpRight, Building2, Check, ChevronDown, CircleAlert, Compass, House, MapPin, Minus, PencilLine, Plus, RotateCcw, Scan, Undo2, X } from 'lucide-react'
import { CONCEPT, type ConceptKind } from '../domain/concepts'
import { cleanRing, dist, toLocal, type Frame, type Point, type Ring } from '../domain/geo'
import { groundScreens, rearReservation, SITE_CONFLICT } from '../domain/diligence'
import { PROGRAM, RULE, STUDY, type Program, type RuleId } from '../domain/rules'
import { solve, type Option } from '../domain/solve'
import { StudyMap } from '../map/StudyMap'
import type { Scene } from '../map/scene'
import { EXAMPLES, loadContext, matchFrontage, overlapsBuildings, supportedArea, type SiteContext } from '../site'
import { DataNotes, fmt, Inspector } from './Inspector'
import { Section } from './Section'
import { Comparison, Walkthrough, type WalkthroughState } from './Experience'
import { roadSection } from './sectionGeometry'
import { Axon, DrawingDownload, ModelRail } from './Drawing'
import { Diligence, type OverlayView, type SiteInputs } from './Diligence'

const defaultSite: SiteInputs = { conflict: 'none', restriction: { kind: 'Easement', depth: 0 } }
type Snapshot = { ring: Ring; street: number; front: number | null; width: string; assumed: boolean; program: Program; site: SiteInputs }
const example = (street: number): Snapshot => {
  const e = EXAMPLES[street]
  return { ring: e.ring, street, front: e.front, width: String(e.width), assumed: true, program: e.program, site: defaultSite }
}
const initial = example(0)
const getHashRule = (): RuleId | null => {
  const id = location.hash.replace('#rule-', '') as RuleId
  return Object.hasOwn(RULE, id) ? id : null
}

function ConceptCard({ option, active, onSelect, locked, plot, frame, ceiling }: { option: Option; active: boolean; onSelect: () => void; locked: boolean; plot:Ring; frame?:Frame; ceiling:number }) {
  const concept = CONCEPT[option.kind]
  return <button type="button" className={`concept-card ${active ? 'current' : ''}`} aria-pressed={active} onClick={onSelect} disabled={locked}>
    <span className="specimen"><span className="letter">{concept.letter}</span>{frame && <Axon option={option} plot={plot} frame={frame} ceiling={ceiling}/>}
      {active ? <Check className="concept-icon" size={14}/> : <ArrowUpRight className="concept-icon" size={14}/>}</span>
    <span className="concept-top"><strong>{concept.name}</strong></span>
    <span className="concept-yield">{fmt(option.gfa)} <small>m² GFA</small></span>
    <span className="concept-meta">{option.floors.length} floors <b>·</b> {fmt(option.h)} m high</span>
    <span className="concept-meta">{fmt(option.open)} m² open ground</span>
    <span className="concept-control" title={`Controlling factor: ${option.control.label}`}>{option.control.label}</span>
  </button>
}
export function App() {
  const [working, setState] = useState(initial), current = useRef(working)
  const [tour, setTour] = useState<WalkthroughState | null>(null), tourButton = useRef<HTMLButtonElement>(null)
  const [compare, setCompare] = useState(false), [probe, setProbe] = useState<number | null>(null)
  const [compareTo, setCompareTo] = useState<ConceptKind>('court')
  const [scan, setScan] = useState<OverlayView>(null), [fireWidth, setFireWidth] = useState(3.5), [briefRevision, setBriefRevision] = useState(0)
  const state: Snapshot = !tour ? working : tour.step === 3 ?
    { ...initial, width: tour.alternate ? '16' : '15.99', program: 'office' } :
    tour.step === 2 && tour.alternate ? { ...initial, width: '12' } : initial
  const [context, setContext] = useState<SiteContext>(), [contextError, setContextError] = useState(false)
  const [streetTarget, setStreetTarget] = useState(0)
  const [focus, setFocus] = useState({ ring: initial.ring, revision: 0 })
  const [revision, setRevision] = useState({ id: 0, start: 0 })
  const [mode, setMode] = useState<'view' | 'draw' | 'edit'>('view')
  const [sketch, setSketch] = useState<Ring>([])
  const [vertex, setVertex] = useState(0), [history, setHistory] = useState<Snapshot[]>([])
  const [kind, setKind] = useState<ConceptKind>('bar'), [level, setLevel] = useState<number | null>(null), [regime, setRegime] = useState<number | null>(null)
  const [envelope, setEnvelope] = useState(false), [rule, setRule] = useState(getHashRule)
  const raf = useRef<number | null>(null), move = useRef<{ i: number; point: Point; start: number } | null>(null)
  const firstDragTime = useRef<number | null>(null)

  useEffect(() => { loadContext().then(setContext, () => setContextError(true)) }, [])
  useLayoutEffect(() => {
    const debug = window.plotStudyDebug
    if (!debug || !revision.id) return
    const id = requestAnimationFrame(() => debug.ui.push({ revision: revision.id, ms: performance.now() - revision.start }))
    return () => cancelAnimationFrame(id)
  }, [revision])
  useEffect(() => {
    const cb = () => { const hashRule = getHashRule(); if (hashRule) setRule(hashRule) }
    window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb)
  }, [])
  const save = useCallback((value: Snapshot) => setHistory(h => [...h.slice(-39), value]), [])
  const cancelMove = useCallback(() => { if (raf.current !== null) cancelAnimationFrame(raf.current); raf.current = null; move.current = null }, [])
  const commit = useCallback((next: Snapshot, allowUndo = true, start = performance.now()) => {
    if (allowUndo) { cancelMove(); save(current.current) }
    current.current = next
    setState(next); setRevision(r => ({ id: r.id + 1, start }))
  }, [cancelMove, save])
  const loadExample = (street: number, reset = false) => {
    const next = example(street)
    commit(next); setStreetTarget(street); setFocus(f => ({ ring: next.ring, revision: f.revision + 1 }))
    setMode('view'); setSketch([]); setVertex(0); setKind('bar'); setLevel(null); setRegime(null)
    setScan(null); setFireWidth(3.5); setBriefRevision(v => v + 1)
    if (reset) { setEnvelope(false); setRule(null); setCompare(false); setProbe(null); setCompareTo('court') }
  }
  const undo = () => {
    if (mode === 'draw') { setSketch(r => r.slice(0, -1)); return }
    const prior = history.at(-1)
    if (!prior) return
    cancelMove(); commit(prior, false); setHistory(h => h.slice(0, -1)); setVertex(0)
    if (prior.street !== state.street) { setStreetTarget(prior.street); setFocus(f => ({ ring: prior.ring, revision: f.revision + 1 })) }
  }
  const setProgram = (program: Program) => {
    if (program !== state.program) { commit({ ...state, program }); setLevel(null); setRegime(null) }
  }
  const width = state.width.trim() ? Number(state.width) : NaN
  const viewEnvelope = tour ? tour.step === 2 : envelope
  const viewRule = tour ? tour.rule !== undefined ? tour.rule : tour.step === 2 ? 'B/N-SKY' : null : rule
  const viewKind = tour ? tour.step === 1 && tour.alternate ? 'court' : 'bar' : kind
  const viewRegime = tour ? tour.step === 2 ? 7 : null : regime
  const viewLevel = tour ? tour.step === 2 ? 7 : null : level
  const setWidth = (value: string) => commit({ ...state, width: value, assumed: false })
  const road = EXAMPLES[state.street]
  const metric = useMemo(() => cleanRing(state.ring.map(toLocal)), [state.ring])
  const match = useMemo(() => {
    if (metric.error) return { frontage: null, choices: [] as number[], unsupportedFrontage: undefined }
    if (context) return matchFrontage(metric.ring, road.roadId, state.front, context)
    const e = EXAMPLES[state.street]
    return state.ring === e.ring ?
      { choices: [e.front], frontage: { a: metric.ring[e.front], b: metric.ring[e.front + 1], wayId: e.roadId }, unsupportedFrontage: undefined } :
      { choices: [], frontage: null, unsupportedFrontage: undefined }
  }, [context, metric, state.street, state.front, state.ring, road.roadId])
  const reservation = useMemo(() => match.frontage && state.site.restriction.depth > 0 ?
    rearReservation(metric.ring, match.frontage, state.site.restriction.depth) : [],
  [match.frontage, metric.ring, state.site.restriction.depth])
  const result = useMemo(() => solve({ plot: state.ring.length === metric.ring.length && !metric.error ? metric.ring : state.ring.map(toLocal),
    frontage: match.frontage, program: state.program, rowWidthM: width, reservation,
    assumptions: { supportedArea, unsupportedFrontage: match.unsupportedFrontage, knownSiteConflict: SITE_CONFLICT[state.site.conflict] } }),
    [metric, match, state.program, state.ring, state.site.conflict, reservation, width])
  const isDrawing = mode === 'draw', stale = isDrawing || result.scopeStatus !== 'supported', option = stale ? undefined : result.options.find(o => o.kind === viewKind) ?? result.options[0]
  const last = useRef<{ option: Option; ring: Ring } | undefined>(undefined)
  useLayoutEffect(() => { if (option && !tour) last.current = { option, ring: state.ring } }, [option, state.ring, tour])
  const preview = stale && !tour ? last.current : undefined
  const slices = useMemo(() => stale ? [] : (viewRegime ? result.envelopeByTop[viewRegime - 1] : option?.slices) ??
    result.envelopeByTop.filter(a => a.some(s => s.polygon.length)).at(-1) ?? [], [stale, viewRegime, result, option])
  const activeLevel = viewLevel !== null && viewLevel <= slices.length ? viewLevel : null
  const cutFloor = !tour && mode === 'view' && option && activeLevel && activeLevel <= option.floors.length && !viewEnvelope ? activeLevel : null
  const [a, b] = !stale ? result.options : []
  const comparing = Boolean((tour ? tour.step === 1 : compare && mode === 'view') && a && b)
  const choice = result.options.find(o => o.kind === compareTo && o.kind !== a?.kind) ?? b
  const pair = comparing && a && b && option ? tour ? [a, b] as const :
    option === a ? [a, choice!] as const : [a, option] as const : undefined
  const other = pair?.find(o => o.kind !== option?.kind)
  const cut = useMemo(() => !stale && match.frontage ? roadSection(metric.ring, match.frontage, option) : null, [stale, match.frontage, metric.ring, option])
  const activeScan = !tour && mode === 'view' && option ? scan : null
  const ground = useMemo(() => cut && option && activeScan ? groundScreens(cut.f, option, reservation, fireWidth, activeScan) : undefined,
    [cut, option, activeScan, reservation, fireWidth])
  const selectedProbe = tour ? tour.step === 2 ? tour.probe === undefined ? 3 : tour.probe : null : probe
  const probeDepth = selectedProbe !== null && cut && cut.maxDepth > 0 ? Math.min(selectedProbe, cut.maxDepth) : null
  const sectionProbe = useMemo<Scene['sectionProbe']>(() => probeDepth !== null && cut ? {
    line: [cut.atDepth(-width), cut.atDepth(cut.maxDepth)], at: cut.atDepth(probeDepth),
  } : undefined, [probeDepth, cut, width])
  const changeProbe = (depth: number | null) => tour ? setTour({ ...tour, probe: depth }) : setProbe(depth)
  const scene = useMemo<Scene>(() => ({
    ring: state.ring, previewRing: preview?.ring, valid: !metric.error, preview: preview?.option, option,
    frontage: isDrawing || metric.error ? null : match.frontage, width, roadId: road.roadId,
    envelope: !stale && viewEnvelope, slices, level: activeLevel, rule: viewRule, editing: mode !== 'view', edgeChoices: match.choices,
    sketch: isDrawing ? sketch : undefined, comparison: other, sectionProbe, cutFloor, reservation: isDrawing ? [] : reservation, ground, activeScan,
  }), [state.ring, metric.error, preview, option, isDrawing, match, width, road.roadId, stale, viewEnvelope, slices, activeLevel, viewRule, mode, sketch, other, sectionProbe, cutFloor, reservation, ground, activeScan])
  const overlaps = useMemo(() => context && !metric.error && !isDrawing && overlapsBuildings(metric.ring, context), [context, metric, isDrawing])
  const selectedConcept = (k: ConceptKind) => { setKind(k); setLevel(null); setRegime(null) }
  const inspectRule = (id: RuleId, scroll = false) => {
    const next = viewRule === id && !scroll ? null : id
    if (tour) setTour({ ...tour, rule: next }); else setRule(next)
    if (scroll) requestAnimationFrame(() => document.getElementById(`rule-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }
  const changeRing = (ring: Ring, front: number | null = state.front) => { commit({ ...current.current, ring, front }); setRegime(null) }
  const closeDraw = () => {
    if (sketch.length < 3) return
    commit({ ...current.current, ring: sketch, front: null, site: defaultSite }); setRegime(null)
    setBriefRevision(v => v + 1); setScan(null); setMode('edit'); setSketch([]); setVertex(0)
  }
  const onMapClick = (p: Point, edge?: number, floor?: number) => {
    if (tour) return
    if (isDrawing) {
      if (sketch.length >= 3 && dist(toLocal(p), toLocal(sketch[0])) < 0.7) closeDraw()
      else if (sketch.length < STUDY.maxVertices) setSketch(r => [...r, p])
    } else if (mode === 'edit' && edge !== undefined) {
      commit({ ...state, front: edge })
    } else if (mode === 'view' && floor !== undefined) setLevel(n => n === floor ? null : floor)
  }
  const onVertex = (i: number) => { if (isDrawing && i === 0) closeDraw(); else setVertex(i) }
  const insert = () => {
    const r = state.ring, i = Math.min(vertex, r.length - 1)
    if (r.length >= STUDY.maxVertices || i < 0) return
    const a = r[i], b = r[(i + 1) % r.length]
    const next: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    changeRing([...r.slice(0, i + 1), next, ...r.slice(i + 1)], state.front === null || state.front === i ? null : state.front > i ? state.front + 1 : state.front)
    setVertex(i + 1)
  }
  const remove = () => {
    const r = state.ring, i = Math.min(vertex, r.length - 1)
    if (r.length <= 3 || i < 0) return
    const incident = state.front === i || (state.front !== null && (state.front + 1) % r.length === i)
    changeRing(r.filter((_, j) => i !== j), incident || state.front === null ? null : state.front > i ? state.front - 1 : state.front)
    setVertex(Math.min(i, r.length - 2))
  }
  function applyMove() {
    const update = move.current
    move.current = null; raf.current = null
    if (!update) return
    const prev = current.current, ring = prev.ring.map((p, i) => i === update.i ? update.point : p)
    commit({ ...prev, ring }, false, update.start)
  }
  const onMove = (i: number, point: Point) => {
    const start = firstDragTime.current ?? move.current?.start ?? performance.now()
    firstDragTime.current = null
    if (!raf.current) raf.current = requestAnimationFrame(applyMove)
    move.current = { i, point, start }
  }
  const onDragEnd = () => {
    if (raf.current !== null) { cancelAnimationFrame(raf.current); applyMove() }
  }
  const cancelDraw = () => { setSketch([]); setMode('view'); setVertex(0) }
  const exitTour = () => { setTour(null); tourButton.current?.focus() }
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tour) { e.preventDefault(); exitTour(); return }
      if ((e.target as HTMLElement).matches('input, select, textarea')) return
      if (e.key === 'Escape' && mode !== 'view') { e.preventDefault(); cancelDraw() }
      if (e.key === 'Enter' && isDrawing && !(e.target as HTMLElement).closest('button, a')) { e.preventDefault(); closeDraw() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && mode !== 'view') { e.preventDefault(); undo() }
      if (e.key === 'Delete' && mode === 'edit') { e.preventDefault(); remove() }
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard)
  })

  return <>
    <header className="site-header">
      <div className="header-inner">
        <a className="wordmark" href="#top"><svg width="36" height="36" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m3 27 16 9 18-10-16-9z" stroke="#f6bd8c"/><path d="M9 25V13l11-7 11 6v12l-11 7z" fill="#e5a073"/><path d="m9 13 11 6 11-7-11-6z" fill="#f5d0a8"/><path d="M20 19v12l11-7V12z" fill="#c37b55"/><path d="m9 18 11 6 11-7m-22 6 11 6 11-7" stroke="#5c4a39" strokeWidth=".7"/></svg><span>Soi Atlas</span></a>
        <div className="header-meta">Saphan Sung · ย.3-36 massing study</div>
        <nav aria-label="Study reference"><a href="#due-diligence" className="diligence-nav">Due diligence</a><a href="#data">Site data</a><a href="#rules" className="header-rules">Rules &amp; sources <ArrowUpRight size={14}/></a></nav>
      </div>
    </header>
    <main id="top" className="shell">
      <section className="page-heading" aria-label="Study title and plot tools">
        <div><p className="eyebrow title-eyebrow"><MapPin size={12}/> SAPHAN SUNG <span>/</span> BANGKOK</p>
          <h1>{road.label}<span>.</span></h1><p className="subtitle">{option && a && b ? <>
            On this plot, {CONCEPT[b.kind].name} trades <strong>{fmt(Math.abs(b.gfa-a.gfa))} m² {b.gfa>=a.gfa?'more':'less'}</strong> floor area and <strong>{fmt(Math.abs(b.open-a.open))} m² {b.open>=a.open?'more':'less'}</strong> open ground against {CONCEPT[a.kind].name}.
          </> : 'Draw a plot along the street to see what floor area and height fit.'}</p></div>
        <div className="page-actions">
          <button type="button" className="button tour-launch" ref={tourButton} aria-pressed={Boolean(tour)} disabled={mode !== 'view'} onClick={() => tour ? exitTour() : setTour({ step: 0, alternate: false })}><Compass size={16}/> Guided demo</button>
          <button type="button" className="button subtle reset-button" title="Reset example" aria-label="Reset example" disabled={Boolean(tour)} onClick={() => loadExample(0, true)}><RotateCcw size={15}/></button>
          <button type="button" className="button primary" disabled={Boolean(tour)} onClick={() => { if (mode === 'view') setMode('edit'); else cancelDraw() }}>
            {mode === 'view' ? <PencilLine size={15}/> : <Check size={16}/>} {mode === 'view' ? 'Draw / edit plot' : isDrawing ? 'Exit drawing' : 'Done editing'}</button>
        </div>
      </section>
      {tour && <Walkthrough tour={tour} onStep={step => setTour({ step, alternate: false })} onToggle={() => setTour({ ...tour, alternate: !tour.alternate })}
        onClose={exitTour} area={result.siteArea} width={width} slice={slices.at(-1)} use={result.ruleTrace.use} far={result.ruleTrace.far}/>}
      {mode !== 'view' && <div className="editor" aria-label="Plot editing toolbar">
        <div className="edit-tools">
          {isDrawing ? <>
            <button type="button" className="button" disabled={sketch.length < 3} onClick={closeDraw}><Check size={15}/> Close plot</button>
            <button type="button" className="button" onClick={cancelDraw}><X size={15}/> Cancel</button>
          </> : <>
            <button type="button" className="button" onClick={() => { setSketch([]); setMode('draw'); setVertex(0) }}><Plus size={16}/> Draw new plot</button>
            <button type="button" className="button" disabled={state.ring.length >= STUDY.maxVertices} onClick={insert}>Insert vertex</button>
            <button type="button" className="button" disabled={state.ring.length <= 3} onClick={remove}>Remove vertex</button>
          </>}
          <button type="button" className="button" disabled={isDrawing ? !sketch.length : !history.length} onClick={undo}><Undo2 size={16}/> Undo</button>
        </div>
        <span>{isDrawing ? `${sketch.length} vertices · Click to place corners. Click the first corner or press Enter to close (Esc cancels).` : 'Drag any corner to reshape the plot. Select a corner to insert or delete one. Blue edges border the street.'}</span>
      </div>}
      <div className="workspace">
        <div className="drawing-board" id="site-model">
        <div className="board-heading"><span className="fig-label">FIG. 01</span><strong>Site model</strong><span className="board-coords">{meanCoords(state.ring)}</span></div>
        <StudyMap scene={scene} context={context} contextError={contextError} revision={revision} focus={focus} editing={mode !== 'view'} touring={Boolean(tour)}
          selectedVertex={vertex} onClick={onMapClick} onVertex={onVertex} onMove={onMove} onDragEnd={onDragEnd}
          onDragStart={() => { firstDragTime.current = performance.now(); save(current.current) }} />
        <ModelRail option={option} selected={cutFloor} locked={Boolean(tour)||mode!=='view'} onCut={n=>{setEnvelope(false);setRegime(null);setLevel(n)}}/>
        </div>
        <aside className="surface scenario" aria-labelledby="scenario-title">
          <div className="scenario-head"><h2 id="scenario-title">Parcel settings</h2><span className="zone-pill">ZONE ย.3-36</span></div>
          <div className="site-area"><span>Plot area</span><strong data-testid="site-area">{fmt(isDrawing ? NaN : result.siteArea, 2)} <small>m²</small></strong></div>
          <fieldset className="input-stack" disabled={Boolean(tour)} aria-label="Scenario inputs">
            <div className="field"><span className="field-label">Building use</span><div className="segment">
              <button type="button" aria-pressed={state.program === 'multifamily'} onClick={() => setProgram('multifamily')}><House size={15}/> Condo</button>
              <button type="button" aria-pressed={state.program === 'office'} onClick={() => setProgram('office')}><Building2 size={15}/> Office</button>
            </div></div>
            <div className="field row-field">
              <label htmlFor="width" className="field-label" title="Public right-of-way, not lane width">Street ROW <small>{state.assumed ? 'Assumed' : 'What-if'}</small></label>
              <div className="stepper">
                <button type="button" aria-label="Decrease ROW width" onClick={() => setWidth(String(Number.isFinite(width) ? Math.max(0.1, Math.round((width - 1) * 100) / 100) : road.width))}><Minus size={16}/></button>
                <div><input id="width" aria-label="Public ROW width" type="number" step="any" min="0.1" max="60" value={state.width} onChange={e => setWidth(e.target.value)}/><span>m</span></div>
                <button type="button" aria-label="Increase ROW width" onClick={() => setWidth(String(Number.isFinite(width) ? Math.min(60, Math.round((width + 1) * 100) / 100) : road.width))}><Plus size={16}/></button>
              </div>
            </div>
          </fieldset>
          {!tour && <details className="road-details" open={mode === 'edit' || undefined}>
            <summary>Road &amp; frontage <ChevronDown size={15}/></summary>
            <div className="road-body">
              <p>Changing road width keeps your front plot line fixed and pushes the opposite side of the road outward so you can test wider or narrower streets.</p>
              <a href={`https://www.openstreetmap.org/way/${road.roadId}`} target="_blank" rel="noreferrer">OSM way {road.roadId} <ArrowUpRight size={12}/></a>
              <label htmlFor="example-street">Compare another street</label>
              <div className="road-select"><select id="example-street" value={streetTarget} onChange={e => setStreetTarget(Number(e.target.value))}>{EXAMPLES.map((e, i) => <option key={e.id} value={i}>{e.label}</option>)}</select>
                <button type="button" className="button" onClick={() => loadExample(streetTarget)}>Load example</button></div>
              {mode === 'edit' && <><label htmlFor="front-edge">Frontage edge</label><select id="front-edge" value={state.front ?? ''} onChange={e => commit({ ...state, front: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">Auto when one edge matches</option>{match.choices.map(i => <option key={i} value={i}>Edge {i + 1}: vertex {i + 1} → {(i + 1) % state.ring.length + 1}</option>)}
              </select></>}
            </div>
          </details>}
          <div className="comparisons">
            <div className="scenario-head"><h2>Design options</h2>
              <div className="concept-tools">
                <button type="button" className="button envelope-button" disabled={Boolean(tour) || !a || !b || mode !== 'view'} aria-pressed={comparing} onClick={() => setCompare(c => !c)}><ArrowRightLeft size={13}/> Compare</button>
                <button type="button" className="button envelope-button" disabled={Boolean(tour) || stale || !slices.length} aria-pressed={viewEnvelope} onClick={() => setEnvelope(e => !e)}><Scan size={15}/> Envelope</button>
              </div></div>
            {!stale && result.options.length > 0 && <div className="concepts">{result.options.map(o => <ConceptCard key={o.kind} option={o} active={option?.kind === o.kind} locked={Boolean(tour)} plot={metric.ring} frame={cut?.f} ceiling={Math.max(...result.options.map(v=>v.h))} onSelect={() => selectedConcept(o.kind)}/>)}</div>}
            {pair && option && match.frontage && <>
              {!tour && result.options.length > 2 && <label className="compare-choice">Compare with {CONCEPT[pair[0].kind].name}
                <select aria-label="Comparison design" value={pair[1].kind} onChange={e => {
                  const k = e.target.value as ConceptKind
                  setCompareTo(k); if (option !== pair[0]) selectedConcept(k)
                }}>{result.options.filter(o => o !== pair[0]).map(o => <option key={o.kind} value={o.kind}>{CONCEPT[o.kind].name}</option>)}</select></label>}
              <Comparison options={[...pair]} active={option.kind} plot={metric.ring} frontage={match.frontage} onSelect={k => {
                if (k === pair[0].kind) setCompareTo(pair[1].kind)
                selectedConcept(k)
              }} locked={Boolean(tour)}/>
            </>}
            {!tour && viewEnvelope && !stale && slices.length > 0 && <div className="envelope-controls">
              <label>Height regime<select aria-label="Envelope height regime" value={regime ?? ''} onChange={e => { setRegime(e.target.value ? Number(e.target.value) : null); setLevel(null) }}><option value="">Concept / auto</option>{result.envelopeByTop.map(s => <option key={s.length} value={s.length}>{s.length} levels · {s.at(-1)?.topM} m</option>)}</select></label>
              <label>Slice<select aria-label="Envelope slice" value={activeLevel ?? ''} onChange={e => setLevel(e.target.value ? Number(e.target.value) : null)}><option value="">All floors</option>{slices.map(s => <option key={s.level} value={s.level}>{s.topM} m top{s.reason ? ' · empty' : ''}</option>)}</select></label>
              <p>Each slice shows where a floor can sit at that height. FAR and open-yard rules still cap how much of the shell you can fill.{activeLevel !== null && slices[activeLevel - 1]?.reason ? ` ${slices[activeLevel - 1].reason}` : ''}</p>
            </div>}
            <div aria-live="polite">
              {(isDrawing || result.diagnostics.length > 0) && <div className="diagnostic"><CircleAlert size={17}/><span>{isDrawing ? 'Drawing a new plot. Last valid geometry is a preview only.' : result.diagnostics.join(' ')}{!isDrawing && preview ? ' Last valid geometry is a preview only.' : ''}</span></div>}
              {option && <div className="fit-status"><Check size={14}/><span>Fits the modeled rules</span><a href="#rules">Review checks <ArrowRight size={13}/></a></div>}
            </div>
          </div>
          <p className="scenario-foot">{overlaps ? 'Crosses mapped building footprints; assumes you clear structures inside the plot.' : state.ring === road.ring ? 'Sample plot on a real street. Check title deed, legal ROW width, and zone before relying on these numbers.' : 'Solved under ย.3 rules. Check the official zone sheet, title deed, and legal ROW width.'}</p>
        </aside>
      </div>
      <div className="analysis-heading"><span><ArrowDownRight size={17}/> Drawing notes</span>
        {cut && option && mode==='view' && !tour && <DrawingDownload options={result.options} plot={metric.ring} frame={cut.f} site={road.label} area={result.siteArea} width={width} assumed={state.assumed} program={state.program==='office'?'Office':'Condo'} reservation={state.site.restriction}/>}</div>
      <div className="details-grid">
        <div className="detail-stack">
          <Section plot={metric.ring} cut={cut} width={width} slices={slices} option={option} selected={activeLevel} envelope={viewEnvelope} rule={viewRule} onRule={id => inspectRule(id, true)} probe={probeDepth} onProbe={changeProbe}/>
          <Diligence key={briefRevision} option={option} program={state.program} frame={cut?.f} site={state.site} reservation={reservation}
            onSite={site => commit({ ...current.current, site })} width={fireWidth} onWidth={setFireWidth} scan={activeScan} onScan={setScan} ground={ground} locked={Boolean(tour) || mode !== 'view'}/>
          <DataNotes/>
        </div>
        <Inspector result={result} option={option} stale={stale} rule={viewRule} selected={activeLevel} onRule={inspectRule} onSelect={setLevel} locked={Boolean(tour)}/>
      </div>
      <footer className="site-footer"><span>Soi Atlas · Saphan Sung plot study</span><a href="#top">Back to top ↑</a></footer>
    </main>
  </>
}
function meanCoords(r:Ring) {
  if (!r.length) return ''
  const [lon,lat]=r.reduce(([x,y],p)=>[x+p[0]/r.length,y+p[1]/r.length],[0,0])
  return `${lat.toFixed(4)}° N   ${lon.toFixed(4)}° E`
}
