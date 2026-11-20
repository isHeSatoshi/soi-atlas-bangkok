import { siteFrame, type Frontage } from './envelope'
import { area, AREA_EPS, bounds, difference, intersect, rect, union, type Frame, type Ring, type Shape } from './geo'
import type { Option } from './solve'
import type { Program } from './rules'

export const SITE_CONFLICT = {
  none: '',
  frontage: 'This plot uses a private, curved, or multi-road frontage that needs a different geometry model. Fits are paused.',
  grade: 'The known road or site grade differs from a flat datum. Fits are paused until a level survey is modeled.',
  overlay: 'This restriction cannot be modeled as a simple rear strip. Fits are paused until exact overlay lines are added.',
} as const
export type SiteConflict = keyof typeof SITE_CONFLICT
export type ReserveKind = 'Easement' | 'Utility' | 'Overlay'
export function rearReservation(plot: Ring, frontage: Frontage, depth: number) {
  const basis = siteFrame(plot, frontage)
  if (!basis || !(depth > 0)) return []
  const p: Shape = [[plot]], { f } = basis, b = bounds(p, f)
  return intersect(p, rect(f, b.s0 - 1, b.s1 + 1, b.d1 - depth, b.d1 + 1))
}

export type ProgramFacts = {
  units?: number
  largestUnitM2?: number
  workroomsM2?: number
  roofDeckM2?: number
  projectUsableM2?: number
}
export function parkingScreen(program: Program, gfa: number, facts: ProgramFacts) {
  if (program === 'office') {
    // Gross area is only an upper bound on the clause's working-room trigger.
    if (facts.workroomsM2 === undefined && gfa < 300) return { state: 'below' as const, count: 0 }
    if (facts.workroomsM2 === undefined || facts.workroomsM2 > gfa) return { state: 'unknown' as const }
    return facts.workroomsM2 < 300 ? { state: 'below' as const, count: 0 } :
      { state: 'trigger' as const, count: Math.ceil(gfa / 60) }
  }
  if (facts.largestUnitM2 === undefined || facts.largestUnitM2 <= 0 || facts.largestUnitM2 > gfa) return { state: 'unknown' as const }
  if (facts.largestUnitM2 < 60) return { state: 'below' as const, count: 0 }
  return { state: 'trigger' as const, count: facts.units && facts.units > 0 ? facts.units : undefined }
}
export function fireStairScreen(floors: number, deck?: number) {
  return floors >= 4 || floors === 3 && deck !== undefined && deck > 16 ? 'trigger' :
    floors === 3 && deck === undefined ? 'unknown' : 'below'
}
export function eiaScreen(program: Program, gfa: number, units?: number, projectUsableM2?: number) {
  if (program !== 'multifamily') return 'not-applicable'
  const screenArea = projectUsableM2 ?? gfa
  return screenArea >= 4000 || (units ?? 0) >= 80 ? 'trigger' : units === undefined ? 'unknown' : 'below'
}

type Ground = Pick<Option, 'openGeometry' | 'plantedGeometry' | 'approach' | 'rearWalk'>
export function groundScreens(f: Frame, design: Ground, reservation: Shape, fireWidth: number, mode: 'parking' | 'fire' | 'both' = 'both') {
  const available = difference(design.openGeometry, union([...design.plantedGeometry, ...design.rearWalk, ...reservation]))
  const parkingGround = difference(available, design.approach)
  const fits = (s: Shape, inGround: Shape) => s.length > 0 && area(difference(s, inGround)) <= AREA_EPS
  const box = bounds(design.openGeometry, f)
  const parking = { aisle: [] as Shape, access: [] as Shape, bays: [] as Shape[] }
  // Layout screen only: test a rectangular 90° row on each side of a two-way
  // entrance. No swept paths, dead-end turnarounds or off-site access are implied.
  const aisleM = 6, bayW = 2.4, bayD = 5
  const increment = f.len > 60 ? 1 : 0.5
  for (let s = 0; mode !== 'fire' && s + aisleM <= f.len; s += increment) {
    for (let d = 0; d + aisleM + bayD <= box.d1 && d <= 30; d += increment) {
      const access = d > 0 ? rect(f, s, s + aisleM, 0, d) : []
      if (d > 0 && !fits(access, parkingGround)) break
      for (const direction of [-1, 1]) {
        const bays: Shape[] = []
        const a = direction > 0 ? s + aisleM : s
        for (let i = 0; i < 20; i++) {
          const b = a + direction * (i + 1) * bayW, c = a + direction * i * bayW
          if (Math.min(b, c) < box.s0 || Math.max(b, c) > box.s1) break
          const aisle = rect(f, Math.min(s, b), Math.max(s + aisleM, b), d, d + aisleM)
          const bay = rect(f, Math.min(b, c), Math.max(b, c), d + aisleM, d + aisleM + bayD)
          if (!fits(aisle, parkingGround) || !fits(bay, parkingGround)) break
          bays.push(bay)
          if (bays.length > parking.bays.length) Object.assign(parking, { bays: [...bays], aisle, access })
        }
      }
    }
  }
  const approach = design.approach.length ? bounds(design.approach, f) : null
  let fire: Shape = []
  if (mode !== 'parking' && approach && Number.isFinite(fireWidth) && fireWidth > 0) {
    const center = (approach.s0 + approach.s1) / 2
    const route = rect(f, center - fireWidth / 2, center + fireWidth / 2, 0, approach.d1)
    if (center - fireWidth / 2 >= 0 && center + fireWidth / 2 <= f.len && fits(route, available)) fire = route
  }
  return { parking, fire }
}
