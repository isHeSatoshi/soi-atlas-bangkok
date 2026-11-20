import { allocate, CONCEPT, stacksFor, trials, type ConceptKind } from './concepts'
import { siteFrame, type Scenario, type Slice } from './envelope'
import { evaluate, type Assessment, type Candidate, type Check } from './evaluate'
import { area, AREA_EPS, bounds, cleanRing, difference, intersect, type Ring, type Shape } from './geo'
import { STUDY, useCap, type RuleId } from './rules'

export type Option = Assessment & Pick<Candidate, 'plantedGeometry' | 'approach' | 'rearWalk'> &
  { kind: ConceptKind; slices: Slice[]; control: { label: string; rule: RuleId } }
export type SolveInput = Omit<Scenario, 'frontage'> & {
  frontage: Scenario['frontage'] | null
  assumptions?: { supportedArea?: Shape; unsupportedFrontage?: string; knownSiteConflict?: string }
}
export type Result = {
  scopeStatus: 'supported' | 'invalid' | 'outside' | 'frontage-needed' | 'unsupported'
  siteArea: number
  ruleTrace: { far: number; use: number; study: number }
  envelopeByTop: Slice[][]
  options: Option[]
  diagnostics: string[]
}
function controlling(checks: Check[], kind: ConceptKind) {
  const budgets: [RuleId, string][] = [['Z-USE', 'Use allowance'], ['Z-FAR', 'Base FAR'], ['STUDY-GFA', 'Study GFA ceiling']]
  const [id, label] = budgets.sort(([a], [b]) => checks.find(c => c.id === a)!.slack - checks.find(c => c.id === b)!.slack)[0]
  const cap = checks.find(c => c.id === id)!
  const tiedStudy = id === 'Z-USE' && checks.find(c => c.id === 'STUDY-GFA')?.threshold === cap.threshold
  if (cap.slack <= Math.max(3, cap.threshold * 0.035)) return { rule: id, label: tiedStudy ? 'Near use + study ceilings' : `Near ${label.toLowerCase()}` }
  const yard = checks.filter(c => c.id === 'B-OPEN' || c.id === 'Z-OSR').sort((a, b) => a.slack - b.slack)[0]
  if (yard.slack < 2) return { rule: yard.id, label: 'Open ground' }
  if (kind === 'court') return { rule: 'FORM' as const, label: 'Lower rise + terrace' }
  if (kind === 'pavilion') return { rule: 'FORM' as const, label: 'Low-rise design target' }
  if (kind === 'lantern') return { rule: 'FORM' as const, label: 'Slim plate + roof step' }
  const geo = checks.filter(c => ['B/N-FRONT', 'B/N-SIDE', 'B/N-SKY', 'B-RING'].includes(c.id))
    .sort((a, b) => (a.id === 'B/N-SKY' ? a.slack / 2 : a.slack) - (b.id === 'B/N-SKY' ? b.slack / 2 : b.slack))[0]
  return geo.slack < 0.3 ? { rule: geo.id, label: ({
    'B/N-FRONT': 'Street setback', 'B/N-SIDE': 'Private setbacks', 'B/N-SKY': 'Road height plane', 'B-RING': 'All-round clearance',
  } as Record<string, string>)[geo.id] } : { rule: 'FORM' as const, label: 'Tested plate proportions' }
}
export function solve(input: SolveInput): Result {
  const raw = cleanRing(input.plot), plot: Ring = raw.ring
  const siteArea = raw.error ? 0 : area([[plot]])
  const w = input.rowWidthM
  const common = { siteArea, ruleTrace: { far: STUDY.far * siteArea, use: Number.isFinite(w) && w > 0 ? useCap(input.program, w) : 0, study: STUDY.gfa } }
  const fail = (scopeStatus: Result['scopeStatus'], reason: string): Result =>
    ({ scopeStatus, ...common, diagnostics: [reason], envelopeByTop: [], options: [] })
  if (raw.error) return fail('invalid', raw.error)
  if (plot.length > STUDY.maxVertices) return fail('invalid', `Use at most ${STUDY.maxVertices} vertices in this study.`)
  if (!Number.isFinite(w) || w <= 0 || w > 60) return fail('invalid', 'Enter a ROW width above 0 and at most 60 m.')
  const support = input.assumptions?.supportedArea
  if (support && area(difference([[plot]], support)) > AREA_EPS) return fail('outside', 'Outside the supported study area. The whole plot must lie inside the dashed window.')
  if (input.assumptions?.knownSiteConflict) return fail('unsupported', input.assumptions.knownSiteConflict)
  if (input.assumptions?.unsupportedFrontage) return fail('unsupported', input.assumptions.unsupportedFrontage)
  const frontage = input.frontage, basis = frontage && siteFrame(plot, frontage)
  if (!frontage || !basis) return fail('frontage-needed', 'New frontage needed. Select a plot edge adjoining the displayed road.')
  if (bounds([[plot]], basis.f).d0 < -0.002) return fail('unsupported', 'Part of this plot lies behind the assumed near ROW line. A single straight frontage cannot model this site.')
  const site = { ...input, plot, frontage }
  const envelopeByTop = stacksFor(site), diagnostics: string[] = []
  const ranked = trials(site, basis.f, siteArea, envelopeByTop)
  const options: Option[] = []
  const accept = (candidates: typeof ranked, max: number) => {
    for (const trial of candidates.slice(0, max)) {
      const candidate = allocate(site, basis.f, trial.floors), result = evaluate(site, candidate)
      if (!result.fits) continue
      const distinct = options.every(o => o.floors.length !== result.floors.length || o.floors.some((fl, i) => {
        const next = result.floors[i], common = area(intersect(fl.polygon, next.polygon))
        return fl.areaM2 + next.areaM2 - 2 * common >= Math.max(4, 0.08 * Math.max(fl.areaM2, next.areaM2))
      }))
      if (!distinct) continue
      options.push({ ...candidate, ...result, kind: trial.kind, slices: trial.slices, control: controlling(result.checks, trial.kind) }); return
    }
  }
  accept(ranked.filter(t => t.kind === 'bar'), 16)
  const first = options[0]
  // Prefer fewer levels for the terrace option, without requiring it on every plot.
  const courts = ranked.filter(t => t.kind === 'court')
  const preferred = first ? courts.filter(t => t.floors.length < first.floors.length) : courts
  accept([...preferred, ...courts.filter(t => !preferred.includes(t))], 20)
  accept(ranked.filter(t => t.kind === 'pavilion'), 8)
  accept(ranked.filter(t => t.kind === 'lantern' && (!first || t.floors.length >= first.floors.length - 1 && area(t.floors[0].polygon) < area(first.covered) * 0.8)), 8)
  if (options.length === 0) diagnostics.push(envelopeByTop.every(st => !st[0].polygon.length) ?
    site.reservation?.length ? 'Setbacks and the no-build strip leave no buildable area.' : 'Setbacks leave no buildable area.' :
    'No fitting candidate found by this search. A usable plate, qualifying façade, rear walk or contiguous planting may not fit.')
  if (options.length === 1) diagnostics.push(`One fitting concept found: ${CONCEPT[options[0].kind].name}. The search did not find a second.`)
  return { scopeStatus: 'supported', ...common, diagnostics, envelopeByTop, options }
}
