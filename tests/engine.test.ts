import { describe, expect, it } from 'vitest'
import { area, cleanRing, difference, frame, intersect, rect, toLocal, union, type Point, type Ring, type Shape } from '../src/domain/geo'
import { envelopeFor, siteFrame, type Scenario } from '../src/domain/envelope'
import { evaluate, type Candidate } from '../src/domain/evaluate'
import { allocate } from '../src/domain/concepts'
import { solve } from '../src/domain/solve'
import { frontageQualifies, maxSkyHeight, openNeeds, openingBase, roadLine, roundClearance, sideClearance, skyDepth, useCap } from '../src/domain/rules'
import { EXAMPLES, supportedArea } from '../src/site'

const square: Ring = [[0, 0], [20, 0], [20, 20], [0, 20]]
const scenario = (plot = square, width = 6): Scenario => ({ plot, frontage: { a: plot[0], b: plot[1] }, program: 'multifamily', rowWidthM: width })
const f = frame(square[0], square[1], true)
const plate = (w: number, d: number, depth: number, s = 3.1) => rect(f, s, s + w, d, d + depth)
const candidate = (plates: readonly Shape[], plantedGeometry: Shape = [], approach = plate(1.52, 0, 3, 10 - 0.76)): Candidate => ({
  floors: plates.map((polygon, i) => ({ polygon, baseM: i * 3, topM: (i + 1) * 3 })), approach, plantedGeometry, rearWalk: [],
})
const status = (a: ReturnType<typeof evaluate>, id: string) => a.checks.find(c => c.id === id)?.status
describe('independent numeric oracles', () => {
  it('uses separate open-ground denominators and changes drivers', () => {
    expect(openNeeds('multifamily', 400, 800, 280)).toEqual({ zone: 100, bma: 120, national: 84 })
    expect(openNeeds('multifamily', 400, 1000, 280).zone - 120).toBe(5)
    expect(Math.max(...Object.values(openNeeds('office', 400, 300, 280)))).toBe(40)
    const covered = plate(20, 3, 14, 0), minor = plate(10, 3, 8)
    const a800 = evaluate(scenario(), candidate([covered, covered, plate(20, 3, 12, 0)]))
    const a1000 = evaluate(scenario(), candidate([covered, covered, covered, minor, minor]))
    expect([a800.gfa, a800.open, a1000.gfa, a1000.open]).toEqual([800, 120, 1000, 120])
    expect([status(a800, 'B-OPEN'), status(a800, 'Z-OSR'), status(a1000, 'Z-FAR'), status(a1000, 'Z-OSR')]).toEqual(['pass', 'pass', 'pass', 'fail'])
  })
  it('honors exact road-line and sky thresholds', () => {
    const got = [4, 6, 9.99, 10, 16, 20, 20.01].map(w => roadLine(w, true))
    ;[4, 3, 1.005, 1, 1.6, 2, 2].forEach((v, i) => expect(got[i]).toBeCloseTo(v, 9))
    expect(roadLine(4, false)).toBe(1)
    expect([maxSkyHeight(6, 3), maxSkyHeight(6, 7), skyDepth(6, 21)]).toEqual([18, 26, 4.5])
    const s = envelopeFor(scenario(), 7)
    expect(area(s[0].polygon)).toBeCloseTo(196, 2)
    expect(area(s[6].polygon)).toBeCloseTo(175, 2)
    expect(area(envelopeFor(scenario(square, 12), 7)[6].polygon)).toBeCloseTo(210, 2)
  })
  it('does not soften height, use or frontage boundaries', () => {
    expect([openingBase(9), openingBase(9.01), sideClearance(9, 2, 6), sideClearance(9, 3, 9), roundClearance(15), roundClearance(15.01)]).toEqual([2, 3, 2, 3, 1, 2])
    expect([useCap('office', 15.99), useCap('office', 16), useCap('multifamily', 29.99), useCap('multifamily', 30)]).toEqual([300, 500, 1000, 10000])
    expect(frontageQualifies(8, 64, 20)).toBe(false)
    expect(frontageQualifies(8.01, 64, 20)).toBe(true)
    expect(frontageQualifies(8.01, 64, 20.01)).toBe(false)
    const design = candidate([plate(10, 3, 10)])
    design.floors[0].topM = 23
    expect(status(evaluate(scenario(), design), 'STUDY-H')).toBe('fail')
    design.floors[0].topM = 22.99
    expect(status(evaluate(scenario(), design), 'STUDY-H')).toBe('pass')
  })
  it('measures the area actually drawn, including upper floor cutbacks', () => {
    const plates = [plate(10, 3, 14), plate(10, 3, 11), plate(10, 3, 8)]
    const a = evaluate(scenario(), candidate(plates))
    expect([a.gfa, a.h, a.open, area(a.covered)]).toEqual([330, 9, 260, 140])
    a.floors.forEach((p, i) => expect(p.areaM2).toBeCloseTo([140, 110, 80][i], 8))
    expect(status(evaluate(scenario(), candidate([plates[0], plate(10, 3, 11, 4)])), 'FORM')).toBe('fail')
  })
  it('rejects independently oversized GFA, a 1 cm sky violation, small planting, blocked frontage and access overlap', () => {
    const cover = plate(10, 3, 16, 5)
    const three = [cover, cover, cover]
    expect(evaluate(scenario(), candidate(three)).open).toBe(240)
    const plant = difference(rect(f, 0, 20, 3, 20), cover)
    const plant119 = intersect(plant, rect(f, 0, 20, 9.1, 20))
    expect(area(plant119)).toBe(119)
    expect(status(evaluate(scenario(), candidate(three, plant119)), 'Z-PLANT')).toBe('fail')
    expect(status(evaluate(scenario(), candidate(three, plant)), 'Z-PLANT')).toBe('pass')
    expect(status(evaluate(scenario(), candidate(three, rect(f, 0, 20, 3, 20))), 'Z-PLANT')).toBe('fail') // roof
    const open = difference([[square]], cover)
    expect(status(evaluate(scenario(), candidate(three, open, plate(1.52, 0, 3, 9.24))), 'Z-PLANT')).toBe('fail') // access
    const deep = plate(10, 4.495, 10)
    expect(status(evaluate(scenario(), candidate(Array(7).fill(deep))), 'B/N-SKY')).toBe('fail')
    expect(status(evaluate(scenario(), candidate(Array(7).fill(plate(14, 5, 11)))), 'Z-FAR')).toBe('fail')
    const long: Ring = [[0, 0], [20, 0], [20, 50], [0, 50]]
    expect(status(evaluate(scenario(long), candidate([plate(8, 20.01, 9)])), 'B-FRONTAGE')).toBe('fail')
  })
})
describe('topology and worked sites', () => {
  it('keeps concavity and orientation', () => {
    const l: Ring = [[0, 0], [30, 0], [30, 12], [12, 12], [12, 30], [0, 30]]
    const rot = ([x, y]: Point): Point => [x * Math.cos(37 * Math.PI / 180) - y * Math.sin(37 * Math.PI / 180), x * Math.sin(37 * Math.PI / 180) + y * Math.cos(37 * Math.PI / 180)]
    const reverse = l.map(rot).reverse()
    const a = envelopeFor(scenario(l), 4)
    const b = envelopeFor({ ...scenario(reverse), frontage: { a: rot(l[0]), b: rot(l[1]) } }, 4)
    expect(area([[l]])).toBe(576)
    expect(area(intersect(a[0].polygon, rect(f, 19, 21, 19, 21)))).toBe(0)
    expect(Math.abs(area(a[3].polygon) - area(b[3].polygon))).toBeLessThan(0.05)
  })
  it('rejects crossings and non-finite points, preserves legitimate closure, splits islands, and reports skinny plots', () => {
    expect(cleanRing([...square, square[0]]).ring).toHaveLength(4)
    expect(cleanRing([[0, 0], [20, 20], [20, 0], [0, 20]]).error).toMatch(/cross/)
    expect(cleanRing([[0, 0], [Infinity, 20], [20, 0]]).error).toMatch(/finite/)
    const strip: Ring = [[0, 0], [20, 0], [20, 2], [0, 2]]
    expect(solve(scenario(strip)).diagnostics[0]).toMatch(/Setbacks/)
    const dumbbell: Ring = [[0, 0], [36, 0], [36, 15], [24, 15], [24, 3], [12, 3], [12, 15], [0, 15]]
    expect(envelopeFor(scenario(dumbbell), 4)[0].polygon).toHaveLength(2)
  })
  it('solves the projected default with four distinct independently passing options', () => {
    const plot = EXAMPLES[0].ring.map(toLocal)
    const s = scenario(plot)
    const a = solve({ ...s, assumptions: { supportedArea } })
    expect(Math.abs(a.siteArea - 453.91)).toBeLessThan(0.05)
    expect(a.options.map(o => o.kind)).toEqual(['bar', 'court', 'pavilion', 'lantern'])
    expect(a.options[0].h).toBeGreaterThan(a.options[1].h)
    expect(a.options[0].open).not.toEqual(a.options[1].open)
    for (const o of a.options) expect(evaluate(s, o).checks.filter(c => c.status === 'fail')).toEqual([])
    expect(a.options[0].gfa).toBeGreaterThan(600)
    expect(a.options[1].gfa).toBeGreaterThan(575)
    expect(a.options[2].floors.length).toBeLessThanOrEqual(3)
    expect(a.options[2].h).toBeLessThan(a.options[1].h)
    expect(a.options[3].open).toBeGreaterThan(a.options[0].open + 30)
    expect(a.options[3].floors.at(-1)!.areaM2).toBeLessThan(a.options[3].floors[0].areaM2 - 8)
    const off6 = solve({ ...s, program: 'office' })
    const off16 = solve({ ...s, program: 'office', rowWidthM: 16 })
    expect([off6.ruleTrace.use, off16.ruleTrace.use]).toEqual([300, 500])
    expect(off6.options[0]?.gfa).toBeGreaterThan(250)
    expect(off16.options[0]?.gfa).toBeGreaterThan(400)
  })
  it('evaluates both independent hand-drawn concept witnesses', () => {
    const notch: Ring = [[0, 0], [22, 0], [22, 16], [17, 16], [17, 22], [0, 22]]
    const s = scenario(notch), basis = siteFrame(notch, s.frontage)!.f
    const bar = rect(basis, 4, 16, 4, 13)
    const lower = union([...rect(basis, 3.25, 18.75, 3.5, 12.5), ...rect(basis, 3.25, 12.5, 12.5, 18.5)])
    const upper = rect(basis, 3.25, 12.5, 6.5, 18.5)
    for (const [plates, gfa, open, height, minPlant] of [
      [Array<Shape>(6).fill(bar), 648, 346, 18, 173], [[lower, lower, upper, upper], 612, 259, 12, 129.5],
    ] as const) {
      const a = evaluate(s, allocate(s, basis, candidate(plates).floors))
      expect([a.gfa, a.open, a.h]).toEqual([gfa, open, height])
      expect(a.planting).toBeGreaterThanOrEqual(minPlant)
      expect(a.checks.filter(c => c.status === 'fail')).toEqual([])
    }
  })
  it('checks full window containment before solving, and rejects missing or non-supporting frontage', () => {
    expect(solve({ ...scenario(), assumptions: { supportedArea: plate(10, 0, 20) } }).scopeStatus).toBe('outside')
    expect(solve({ ...scenario(), frontage: null }).scopeStatus).toBe('frontage-needed')
    const over: Ring = [[0, 0], [12, 0], [12, 12], [-4, 12], [-4, -3], [-2, -3]]
    expect(solve(scenario(over)).scopeStatus).toBe('unsupported')
  })
})
