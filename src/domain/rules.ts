export type Program = 'multifamily' | 'office'
export const STUDY = { far: 2.5, osr: 0.125, planting: 0.5, gfa: 1000, heightExclusive: 23, minPlate: 25, minWidth: 3, maxVertices: 80 } as const
export const PROGRAM = {
  multifamily: { label: 'Condo', floorM: 3, open: 0.3 },
  office: { label: 'Office', floorM: 3.5, open: 0.1 },
} as const
export const SOURCE = {
  zone: 'https://download.asa.or.th/03media/04law/cpa/mr56-bma.pdf',
  amendment: 'https://download.asa.or.th/03media/04law/cpa/bb69-bma.pdf',
  map: 'https://download.asa.or.th/03media/04law/cpa/BMAlanduse/mr56-bma-08b.jpg',
  bma: 'https://download.asa.or.th/03media/04law/cba/bb/bb44-03.pdf',
  national: 'https://download.asa.or.th/03media/04law/cba/mr/mr43-55-upd68.pdf',
} as const
type Ref = readonly [string, string]
type Rule = { name: string; text: string; unit: string; kind: 'Law + interpretation' | 'Study limit' | 'Design check'; refs: readonly Ref[] }
export const RULE = {
  'Z-FAR': { name: 'Floor area ratio', text: 'Total floor area is capped at 2.5 times the plot area. Transit bonuses and transferred area are left out.', unit: 'm²', kind: 'Law + interpretation', refs: [['ย.3 · §10(1)', SOURCE.zone]] },
  'Z-OSR': { name: 'Zone open space', text: 'Open ground must be at least 12.5% of gross floor area. Note the denominator: that is 12.5% of built floor area, which equals 31.25% of the land if you build to the full 2.5× FAR.', unit: 'm²', kind: 'Law + interpretation', refs: [['ย.3 · §§4, 10(2)', SOURCE.zone]] },
  'B-OPEN': { name: 'Bangkok open ground', text: 'Leave at least 30% of the plot uncovered for a condo, or 10% for a standalone office.', unit: 'm²', kind: 'Law + interpretation', refs: [['BMA · §52(1-2)', SOURCE.bma]] },
  'N-OPEN': { name: 'National open space', text: 'Leave 30% (condo) or 10% (office) of the largest floor area as open ground. Tested alongside the zone and Bangkok yard rules; the strictest one governs.', unit: 'm²', kind: 'Law + interpretation', refs: [['MR 55 · §33', SOURCE.national]] },
  'Z-PLANT': { name: 'Permeable planting', text: 'At least half of the uncovered yard must be permeable green space for trees. Here it is carved out as one continuous patch clear of walkways.', unit: 'm²', kind: 'Law + interpretation', refs: [['ย.3 · §10(2)', SOURCE.zone]] },
  'Z-USE': { name: 'Use allowance', text: 'In ย.3, condos cap at 1,000 m² unless the street is at least 30 m wide (where the cap rises to 10,000 m²). Standalone offices cap at 300 m² on narrow streets and 500 m² once the street reaches 16 m.', unit: 'm²', kind: 'Law + interpretation', refs: [['ย.3 · §10(11), (13)', SOURCE.zone]] },
  'B/N-FRONT': { name: 'Street setback', text: 'On streets under 6 m wide, stay 3 m from the road centerline. For offices and condos over 2 floors (or 8 m): stay 6 m from the centerline on streets under 10 m, 1/10 of road width from the front boundary on 10 to 20 m streets, and 2 m back above 20 m.', unit: 'm', kind: 'Law + interpretation', refs: [['BMA · §50', SOURCE.bma], ['MR 55 · §41', SOURCE.national]] },
  'B/N-SKY': { name: 'Road height plane', text: 'No point on the building can rise higher than twice its horizontal distance from the opposite side of the road. For a floor top at height z on a road of width W, the wall must step back at least z/2 - W.', unit: 'm', kind: 'Law + interpretation', refs: [['BMA · §49', SOURCE.bma], ['MR 55 · §44', SOURCE.national]] },
  'B/N-SIDE': { name: 'Private boundaries', text: 'Assuming windows or balconies on side and rear walls, stay 2 m from neighbor lines up to 9 m height, and 3 m once total height passes 9 m or from floor 3 upward.', unit: 'm', kind: 'Law + interpretation', refs: [['BMA · §54', SOURCE.bma], ['MR 55 · §50', SOURCE.national]] },
  'B-RING': { name: 'All-round clearance', text: 'Keep a 1 m clear margin around the building up to 15 m height, and 2 m above 15 m. Overlaps with other setbacks; the wider margin wins.', unit: 'm', kind: 'Law + interpretation', refs: [['BMA · §55', SOURCE.bma]] },
  'B-FRONTAGE': { name: 'Direct street façade', text: 'To skip an extra front yard under BMA §§52(6) and 53, the ground floor must present an clear street-facing wall wider than 1/8 of the building perimeter and within 20 m of the road.', unit: '× perimeter', kind: 'Law + interpretation', refs: [['BMA · §§52(6), 53', SOURCE.bma]] },
  'B-REAR': { name: 'Office rear walk', text: 'For offices, keep a clear 2 m walking strip behind the ground floorplate, separate from the planted yard.', unit: 'm', kind: 'Law + interpretation', refs: [['BMA · §52(7)', SOURCE.bma]] },
  'STUDY-GFA': { name: 'Study floor-area ceiling', text: 'This low-rise solver caps search at 1,000 m² GFA, even when a wide road allows a larger building.', unit: 'm²', kind: 'Study limit', refs: [] },
  'STUDY-H': { name: 'Study height ceiling', text: 'Low-rise scope stays strictly under 23 m total height (3 m floor-to-floor for condo, 3.5 m for office).', unit: 'm', kind: 'Study limit', refs: [] },
  'FORM': { name: 'Connected, nested plates', text: 'Single building with one connected polygon per floor, no cantilevers, at least 25 m² per floor, and at least 3 m width in the street frame.', unit: '', kind: 'Design check', refs: [] },
  'RESERVE': { name: 'User-entered no-build strip', text: 'Keeps all floors and required planting out of the rear easement or utility strip you entered.', unit: 'm²', kind: 'Design check', refs: [] },
} as const satisfies Record<string, Rule>
export type RuleId = keyof typeof RULE
export const roundClearance = (h: number) => h <= 15 ? 1 : 2
export const openingBase = (h: number) => h <= 9 ? 2 : 3
export const sideClearance = (h: number, level: number, top: number) => Math.max(openingBase(h), level >= 3 || top > 9 ? 3 : 0)
export const roadLine = (w: number, enhanced: boolean) => Math.max(
  w < 6 ? 3 - w / 2 : 0,
  !enhanced ? 0 : w < 10 ? 6 - w / 2 : w <= 20 ? w / 10 : 2,
)
export const useCap = (p: Program, w: number) => p === 'office' ? (w >= 16 ? 500 : 300) : (w >= 30 ? 10000 : 1000)
export const maxSkyHeight = (w: number, d: number) => 2 * (w + d)
export const skyDepth = (w: number, z: number) => z / 2 - w
export const frontageQualifies = (facade: number, perimeter: number, depth: number) => facade > perimeter / 8 && depth <= 20
export const openNeeds = (p: Program, a: number, g: number, largest: number) => ({
  zone: STUDY.osr * g, bma: PROGRAM[p].open * a, national: PROGRAM[p].open * largest,
})
