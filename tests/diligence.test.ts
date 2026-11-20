import { expect, it } from 'vitest'
import { eiaScreen, fireStairScreen, groundScreens, parkingScreen, rearReservation, SITE_CONFLICT } from '../src/domain/diligence'
import { area, difference, frame, intersect, rect, type Ring } from '../src/domain/geo'
import { solve } from '../src/domain/solve'
import { envelopeFor, type Scenario } from '../src/domain/envelope'
import { evaluate } from '../src/domain/evaluate'

const plot: Ring = [[0, 0], [30, 0], [30, 28], [0, 28]]
const frontage = { a: plot[0], b: plot[1] }
const scenario: Scenario = { plot, frontage, rowWidthM: 6, program: 'multifamily' }
const f = frame(plot[0], plot[1], true)

it('uses the BMA working-room trigger and separate conservative count basis', () => {
  expect(parkingScreen('office', 420, {})).toEqual({ state: 'unknown' })
  expect(parkingScreen('office', 299.99, {})).toEqual({ state: 'below', count: 0 })
  expect(parkingScreen('office', 399.9, { workroomsM2: 299.99 })).toEqual({ state: 'below', count: 0 })
  expect(parkingScreen('office', 399.9, { workroomsM2: 300 })).toEqual({ state: 'trigger', count: 7 })
  expect(parkingScreen('multifamily', 820, { units: 10, largestUnitM2: 59.99 })).toEqual({ state: 'below', count: 0 })
  expect(parkingScreen('multifamily', 820, { units: 10, largestUnitM2: 60 })).toEqual({ state: 'trigger', count: 10 })
})
it('does not treat an unknown condo brief or roof deck as a clear result', () => {
  expect(fireStairScreen(3)).toBe('unknown')
  expect(fireStairScreen(3, 16)).toBe('below')
  expect(fireStairScreen(3, 16.01)).toBe('trigger')
  expect(fireStairScreen(4)).toBe('trigger')
  expect(eiaScreen('multifamily', 999)).toBe('unknown')
  expect(eiaScreen('multifamily', 999, 79)).toBe('below')
  expect(eiaScreen('multifamily', 999, 80)).toBe('trigger')
  expect(eiaScreen('multifamily', 4000, 79)).toBe('trigger')
  expect(eiaScreen('multifamily', 999, 79, 4000)).toBe('trigger')
  expect(eiaScreen('office', 300)).toBe('not-applicable')
})
it('clips the exact rear strip, checks every floor, and withholds fits on known site conflicts', () => {
  const reservation = rearReservation(plot, frontage, 7)
  expect(area(reservation)).toBe(210)
  const constrained = { ...scenario, reservation }
  expect(area(intersect(envelopeFor(constrained, 4)[0].polygon, reservation))).toBe(0)
  const fitted = solve(constrained)
  expect(fitted.options.length).toBeGreaterThan(0)
  expect(fitted.options.every(o => area(intersect(o.covered, reservation)) <= 0.02 && area(intersect(o.plantedGeometry, reservation)) <= 0.02)).toBe(true)
  const bad = { ...fitted.options[0], floors: [{ baseM: 0, topM: 3, polygon: rect(f, 5, 15, 20, 24) }] }
  expect(evaluate(constrained, bad).checks.find(c => c.id === 'RESERVE')).toMatchObject({ actual: 30, status: 'fail' })
  expect(solve({ ...scenario, assumptions: { knownSiteConflict: SITE_CONFLICT.grade } })).toMatchObject({ options: [], scopeStatus: 'unsupported' })
})
it('packs measured parking boxes and classifies a straight route without using cleared planting or reservations', () => {
  const covered = rect(f, 14, 23, 13, 21)
  const openGeometry = difference([[plot]], covered)
  const approach = rect(f, 17, 19, 0, 13), plantedGeometry = rect(f, 3, 27, 22, 27)
  const reserved = rect(f, 25, 30, 0, 21)
  const design = { covered, approach, openGeometry, plantedGeometry, rearWalk: [] }
  const result = groundScreens(f, design, reserved, 3.5)
  expect(area(result.fire)).toBeCloseTo(45.5)
  expect(result.parking.bays.length).toBeGreaterThan(0)
  for (const bay of result.parking.bays) {
    expect(area(bay)).toBeCloseTo(12)
    expect(area(intersect(bay, approach))).toBe(0)
    expect(area(intersect(bay, reserved))).toBe(0)
    expect(area(intersect(bay, plantedGeometry))).toBe(0)
    expect(area(difference(bay, openGeometry))).toBe(0)
  }
  expect(groundScreens(f, design, rect(f, 0, 30, 0, 12), 3.5)).toMatchObject({ fire: [], parking: { bays: [] } })
})
