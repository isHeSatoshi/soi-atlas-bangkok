import { area, AREA_EPS, bounds, difference, DIST_EPS, edges, intersect, perimeter, rect, segmentDistance, union, type Frame, type Ring, type Shape } from './geo'
import { limits, siteFrame, type Scenario } from './envelope'
import { frontageQualifies, maxSkyHeight, openNeeds, PROGRAM, STUDY, useCap, type RuleId } from './rules'

export type Floor = { polygon: Shape; baseM: number; topM: number }
export type Candidate = { floors: Floor[]; plantedGeometry: Shape; approach: Shape; rearWalk: Shape }
export type Check = { id: RuleId; actual: number; threshold: number; unit: string; status: 'pass' | 'fail'; slack: number; relation: 'min' | 'max' | 'less' | 'greater'; reason: string; floor?: number }
export type Assessment = ReturnType<typeof evaluate>

// A nearly parallel exterior edge whose full ROW-to-wall sightline is clear.
export function streetFacade(ground: Shape, cover: Shape, plot: Shape, f: Frame) {
  let best = { length: 0, depth: Infinity, perimeter: 0, approach: [] as Shape }
  if (!ground.length) return best
  const shell = ground[0][0], circumference = perimeter(shell)
  best.perimeter = circumference
  for (const [a, b] of edges(shell)) {
    const [x, d] = f.into(a), [y, e] = f.into(b)
    const len = Math.abs(y - x), depth = Math.max(d, e)
    if (Math.min(d, e) < 0 || depth > 20 || len <= best.length || Math.abs(e - d) > DIST_EPS ||
        Math.min(x, y) < -DIST_EPS || Math.max(x, y) > f.len + DIST_EPS) continue
    const clear = rect(f, Math.min(x, y), Math.max(x, y), 0, Math.min(d, e))
    if (area(difference(clear, plot)) > AREA_EPS || area(intersect(clear, cover)) > AREA_EPS) continue
    const mid = (x + y) / 2, half = Math.min(0.76, len / 2)
    best = { length: len, depth, perimeter: circumference, approach: rect(f, mid - half, mid + half, 0, Math.min(d, e)) }
  }
  return best
}
export function officeRear(ground: Shape, f: Frame) {
  const { s0, s1, d1 } = bounds(ground, f)
  return rect(f, s0, s1, d1 + 0.002, d1 + 2.002)
}
function clearance(floor: Shape, boundary: [Ring[number], Ring[number]][]) {
  let least = Infinity
  for (const ring of floor.flat()) for (const [a, b] of edges(ring))
    for (const [c, d] of boundary) least = Math.min(least, segmentDistance(a, b, c, d))
  return least
}

/** Re-measure delivered shapes; does not trust the generator's envelope, areas or score. */
export function evaluate(site: Scenario, candidate: Candidate) {
  const plot: Shape = [[site.plot]], a = area(plot), basis = siteFrame(site.plot, site.frontage)
  const floors = candidate.floors.map(f => ({ ...f, areaM2: area(f.polygon) }))
  const n = floors.length, h = floors.at(-1)?.topM ?? 0, gfa = floors.reduce((s, f) => s + f.areaM2, 0)
  const covered = union(floors.flatMap(f => f.polygon)), openGeometry = difference(plot, covered)
  const open = area(openGeometry), planting = area(candidate.plantedGeometry)
  const need = openNeeds(site.program, a, gfa, Math.max(0, ...floors.map(f => f.areaM2)))
  const checks: Check[] = []
  function check(id: RuleId, actual: number, threshold: number, unit: string, relation: Check['relation'], reason: string, tolerance = 0, valid = true, floor?: number) {
    const slack = relation === 'max' || relation === 'less' ? threshold - actual : actual - threshold
    const pass = valid && Number.isFinite(slack) && (relation === 'less' || relation === 'greater' ? slack > 0 : slack >= -tolerance)
    checks.push({ id, actual, threshold, unit, relation, reason, status: pass ? 'pass' : 'fail', slack, floor })
  }
  check('Z-FAR', gfa, STUDY.far * a, 'm²', 'max', 'Total floor area across all levels vs 2.5× plot area.')
  check('Z-OSR', open, need.zone, 'm²', 'min', 'Uncovered yard vs 12.5% of total floor area.')
  check('B-OPEN', open, need.bma, 'm²', 'min', 'Uncovered yard vs required share of plot area (30% condo, 10% office).')
  check('N-OPEN', open, need.national, 'm²', 'min', 'Uncovered yard vs required share of the largest floorplate.')
  check('Z-USE', gfa, useCap(site.program, site.rowWidthM), 'm²', 'max', site.program === 'office' ? 'Total office floor area against street-width cap (300 m² under 16 m ROW, 500 m² at 16 m+).' : 'Condo floor area against the 1,000 m² cap on streets under 30 m.')
  check('STUDY-GFA', gfa, STUDY.gfa, 'm²', 'max', 'Low-rise study cap of 1,000 m².')
  check('STUDY-H', h, STUDY.heightExclusive, 'm', 'less', 'Roof height must stay strictly under 23 m.')
  const ground = floors[0]?.polygon ?? []
  const groundOpen = (s: Shape) => area(difference(s, openGeometry)) <= AREA_EPS
  const plantedOk = candidate.plantedGeometry.length === 1 && groundOpen(candidate.plantedGeometry) &&
    area(intersect(candidate.plantedGeometry, union([...candidate.approach, ...candidate.rearWalk, ...(site.reservation ?? [])]))) <= AREA_EPS
  check('Z-PLANT', planting, STUDY.planting * open, 'm²', 'min', plantedOk ? 'One continuous planted patch in the open yard, clear of walkways.' : 'Planted patch is split, under the roof, or blocks a walkway.', 0, plantedOk)
  let form = Boolean(n && basis)
  let facade = { length: 0, depth: Infinity, perimeter: 0, approach: [] as Shape }
  if (basis) {
    const { f, privateEdges } = basis
    const worst: Partial<Record<'B/N-FRONT' | 'B/N-SKY' | 'B/N-SIDE' | 'B-RING', [number, number, number]>> = {}
    const track = (id: keyof typeof worst, actual: number, threshold: number, i: number) => {
      const prev = worst[id]
      if (!prev || actual - threshold < prev[0] - prev[1]) worst[id] = [actual, threshold, i + 1]
    }
    for (const [i, fl] of floors.entries()) {
      if (!fl.polygon.length) { form = false; continue }
      const b = bounds(fl.polygon, f), prev = floors[i - 1]
      const step = PROGRAM[site.program].floorM
      form &&= fl.polygon.length === 1 && fl.areaM2 >= STUDY.minPlate &&
        Math.min(b.s1 - b.s0, b.d1 - b.d0) >= STUDY.minWidth &&
        fl.baseM === i * step && fl.topM === (i + 1) * step &&
        area(difference(fl.polygon, plot)) <= AREA_EPS && (!prev || area(difference(fl.polygon, prev.polygon)) <= AREA_EPS)
      const l = limits(site.program, site.rowWidthM, n, h, i + 1, fl.topM), side = clearance(fl.polygon, privateEdges)
      track('B/N-FRONT', b.d0, l.roadM, i)
      track('B/N-SKY', maxSkyHeight(site.rowWidthM, b.d0), fl.topM, i)
      track('B/N-SIDE', side, l.sideM, i)
      track('B-RING', Math.min(b.d0, side), l.ringM, i)
    }
    const descriptions = {
      'B/N-FRONT': 'Front wall distance from the near road boundary.',
      'B/N-SKY': '2:1 road sky-plane height limit at the tightest roof edge vs floor top.',
      'B/N-SIDE': 'Closest distance from any floor edge to a neighbor boundary.',
      'B-RING': 'Closest distance to the street or any neighbor boundary.',
    }
    for (const id of Object.keys(descriptions) as (keyof typeof descriptions)[]) {
      const [actual, threshold, floor] = worst[id] ?? [0, 1, 1]
      check(id, actual, threshold, 'm', 'min', descriptions[id], DIST_EPS, true, floor)
    }
    facade = streetFacade(ground, covered, plot, f)
    const frontageOk = frontageQualifies(facade.length, facade.perimeter, facade.depth) &&
      area(difference(facade.approach, candidate.approach)) <= AREA_EPS && groundOpen(candidate.approach)
    check('B-FRONTAGE', facade.perimeter ? facade.length / facade.perimeter : 0, 1 / 8, '× perimeter', 'greater',
      frontageOk ? `${facade.length.toFixed(2)} m clear street wall, ${facade.depth.toFixed(2)} m back from the road (max 20 m).` : 'Needs a clear street-facing wall wider than 1/8 of the perimeter within 20 m of the road.', 0, frontageOk)
    if (site.program === 'office') {
      const required = officeRear(ground, f)
      const hasStrip = required.length > 0 && area(difference(required, candidate.rearWalk)) <= AREA_EPS && groundOpen(candidate.rearWalk)
      check('B-REAR', hasStrip ? 2 : 0, 2, 'm', 'min', hasStrip ? 'Clear 2 m walkway reserved behind the office ground floor.' : 'Missing the 2 m rear walkway behind the office ground floor.')
    }
  }
  check('FORM', form ? 1 : 0, 1, '', 'min', form ? 'Every floor is a single connected polygon inside the plot with no overhangs.' : 'A floor overhangs the level below, splits into pieces, crosses the plot line, or is too narrow.')
  if (site.reservation?.length) {
    const occupied = area(intersect(covered, site.reservation))
    check('RESERVE', occupied, 0, 'm²', 'max', 'No floorplate can enter the rear no-build strip.', AREA_EPS)
  }
  return { gfa, h, open, planting, floors, covered, openGeometry, checks, facade,
    openRequired: Math.max(...Object.values(need)), fits: checks.every(c => c.status === 'pass') }
}
