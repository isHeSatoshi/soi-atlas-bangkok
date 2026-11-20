import { area, bounds, difference, intersect, largest, rect, type Frame, type Shape } from './geo'
import { envelopeFor, type Scenario, type Slice } from './envelope'
import { officeRear, streetFacade, type Candidate, type Floor } from './evaluate'
import { PROGRAM, STUDY, useCap } from './rules'

export const CONCEPT = {
  bar: { name: 'Garden Bar', letter: 'A', description: 'Six compact floors stacked over a wide back garden.' },
  court: { name: 'Stepped Court', letter: 'B', description: 'Deeper lower floors that step back into a mid-rise terrace.' },
  pavilion: { name: 'Street Pavilion', letter: 'C', description: 'Low two- or three-storey block hugging the street line.' },
  lantern: { name: 'Sky Lantern', letter: 'D', description: 'Slimmer footprint that leaves extra yard and steps in at the roof.' },
} as const
export type ConceptKind = keyof typeof CONCEPT
export type Trial = { kind: ConceptKind; slices: Slice[]; floors: Floor[]; score: number }
const PAD = 0.009 // Place candidates slightly inside exact geometric slices.

export function trials(site: Scenario, f: Frame, siteArea: number, stack: Slice[][]) {
  const out: Trial[] = [], office = site.program === 'office'
  const budget = Math.min(STUDY.far * siteArea, useCap(site.program, site.rowWidthM), STUDY.gfa)
  const groundMax = siteArea * (1 - PROGRAM[site.program].open)
  for (const slices of stack) {
    const n = slices.length
    for (const kind of ['bar', 'court', 'pavilion', 'lantern'] as const) {
      if (kind === 'court' && n < 2) continue
      if (kind === 'pavilion' && (n < 2 || n > 3) || kind === 'lantern' && n < 4) continue
      const lowerN = kind === 'court' ? Math.ceil(n / 2) : kind === 'lantern' ? n - 1 : n
      const stepped = lowerN !== n
      const lower = slices[lowerN - 1], upper = slices[n - 1]
      if (!lower.polygon.length || !upper.polygon.length) continue
      for (const component of lower.polygon) {
        const box = bounds([component], f)
        const s0 = Math.max(box.s0 + PAD, PAD), s1 = Math.min(box.s1 - PAD, f.len - PAD)
        const maxW = s1 - s0, depth = box.d1 - box.d0 - (office ? 2.03 : PAD)
        if (maxW < STUDY.minWidth || depth < STUDY.minWidth) continue
        // Sample a few coherent proportions and placements, not every possible rectangle.
        const variants = kind === 'bar' ? [[0.85, 0.5, 0], [0.69, 0.15, 0], [0.69, 0.85, 0], [0.95, 0.5, 0.16]] :
          kind === 'court' ? [[0.86, 0.5, 0], [0.72, 0.18, 0], [0.72, 0.82, 0], [0.58, 0.5, 0.11]] :
          kind === 'pavilion' ? [[0.50, 0.5, 0], [0.62, 0.5, 0], [0.45, 0.8, 0]] :
          [[0.69, 0.2, 0.02], [0.69, 0.8, 0.02], [0.55, 0.5, 0.10]]
        for (const [ratio, at, shift] of variants) {
          const d0 = Math.max(lower.frontM, box.d0) + PAD + depth * shift
          const idealD = Math.min(depth * ratio, box.d0 + depth - d0)
          if (idealD < STUDY.minWidth) continue
          const factor = lowerN + (n - lowerN) * 0.61
          let width = Math.min(kind === 'lantern' ? maxW * 0.52 : maxW, (budget - 0.07) / (idealD * factor), (groundMax - 0.07) / idealD)
          if (width < STUDY.minWidth + PAD) continue
          for (let i = 0; i < 3 && width >= STUDY.minWidth + PAD; i++) {
            const left = s0 + (maxW - width) * at, right = left + width
            const d1 = d0 + idealD
            const bottom = largest(intersect([component], rect(f, left, right, d0, d1)))
            if (!bottom.length) break
            const upperStart = Math.max(upper.frontM + PAD, d0 + (kind === 'court' ? idealD * 0.27 : idealD * 0.19))
            const top = !stepped ? bottom : largest(intersect(
              intersect(bottom, upper.polygon),
              rect(f, left + (at > 0.5 ? width * 0.16 : 0), right - (at <= 0.5 ? width * 0.16 : 0), upperStart, d1 + PAD),
            ))
            const a = area(bottom), b = area(top)
            if (Math.min(a, b) < STUDY.minPlate || stepped && a - b < 8 || kind === 'pavilion' && width < idealD * 1.25) break
            const yieldM2 = a * lowerN + b * (n - lowerN)
            const maxCovered = siteArea - STUDY.osr * yieldM2
            const reduction = Math.min((budget - 0.035) / yieldM2, (groundMax - 0.035) / a, (maxCovered - 0.035) / a)
            if (reduction < 1) { width *= Math.max(0.4, reduction * 0.998); continue }
            const floors = slices.map((sl, index) => ({ baseM: sl.baseM, topM: sl.topM, polygon: index < lowerN ? bottom : top }))
            const score = kind === 'court' ? yieldM2 + 0.45 * (a - b) - 8 * upper.topM :
              kind === 'lantern' ? yieldM2 - 4.2 * a + 8 * upper.topM : yieldM2
            out.push({ kind, slices, floors, score })
            break
          }
        }
      }
    }
  }
  return out.sort((a, b) => b.score - a.score)
}
export function allocate(site: Scenario, f: Frame, floors: Floor[]): Candidate {
  // Plates are nested by construction; the evaluator separately recomputes union.
  const cover = floors[0].polygon, plot: Shape = [[site.plot]]
  const approach = streetFacade(cover, cover, plot, f).approach
  const rearWalk = site.program === 'office' ? officeRear(cover, f) : []
  const open = difference(plot, cover)
  const yard = largest(difference(difference(difference(open, approach), rearWalk), site.reservation ?? []))
  const target = STUDY.planting * area(open) + 0.04
  let plantedGeometry = yard
  if (area(yard) > target) {
    const b = bounds(yard, f)
    let lo = b.d0, hi = b.d1
    // A monotone half-plane sweep from the back, taking its largest connected patch.
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      const g = largest(intersect(yard, rect(f, b.s0 - 1, b.s1 + 1, mid, b.d1 + 1)))
      if (area(g) >= target) { lo = mid; plantedGeometry = g } else hi = mid
    }
  }
  return { floors, approach, rearWalk, plantedGeometry }
}
export function stacksFor(site: Scenario) {
  const cache = new Map<number, Shape>()
  return Array.from({ length: Math.ceil(STUDY.heightExclusive / PROGRAM[site.program].floorM) - 1 },
    (_, i) => envelopeFor(site, i + 1, cache))
}
