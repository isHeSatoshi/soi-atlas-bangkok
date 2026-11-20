import { area, bounds, bufferSegments, difference, dist, edges, frame, intersect, rect, same, signedArea, type Point, type Ring, type Shape } from './geo'
import { PROGRAM, roadLine, roundClearance, sideClearance, skyDepth, type Program } from './rules'

export type Frontage = { a: Point; b: Point; wayId?: number }
export type Scenario = { plot: Ring; frontage: Frontage; rowWidthM: number; program: Program; reservation?: Shape }
export type Slice = { level: number; baseM: number; topM: number; polygon: Shape; frontM: number; roadM: number; skyM: number; ringM: number; sideM: number; reason?: string }

export function siteFrame(plot: Ring, { a, b }: Frontage) {
  const es = edges(plot), index = es.findIndex(([p, q]) => (same(a, p) && same(b, q)) || (same(b, p) && same(a, q)))
  if (index < 0 || dist(a, b) < 0.001) return null
  const [p, q] = es[index]
  return { f: frame(p, q, signedArea(plot) > 0), privateEdges: es.filter((_, i) => i !== index) }
}
export function limits(program: Program, w: number, n: number, h: number, level: number, top: number) {
  const roadM = roadLine(w, program === 'office' || n > 2 || h > 8), skyM = skyDepth(w, top)
  const ringM = roundClearance(h), sideM = sideClearance(h, level, top)
  return { roadM, skyM, ringM, sideM, frontM: Math.max(roadM, skyM, ringM) }
}
export function envelopeFor(site: Scenario, n: number, cache = new Map<number, Shape>()): Slice[] {
  const basis = siteFrame(site.plot, site.frontage)
  if (!basis) return []
  const { f, privateEdges } = basis, plot: Shape = [[site.plot]], box = bounds(plot, f)
  const step = PROGRAM[site.program].floorM, h = n * step
  return Array.from({ length: n }, (_, i) => {
    const level = i + 1, topM = level * step
    const l = limits(site.program, site.rowWidthM, n, h, level, topM)
    const setback = Math.max(l.sideM, l.ringM)
    let privateMask = cache.get(setback)
    if (!privateMask) {
      privateMask = difference(difference(plot, bufferSegments(privateEdges, setback)), site.reservation ?? [])
      cache.set(setback, privateMask)
    }
    const polygon = intersect(privateMask, rect(f, box.s0 - 1, box.s1 + 1, l.frontM, box.d1 + 1))
    return { level, baseM: i * step, topM, ...l, polygon,
      reason: area(polygon) > 0 ? undefined : privateMask.length ? 'Street setback or height plane leaves no slice.' : 'Private setbacks or the site reservation leave no slice.' }
  })
}
