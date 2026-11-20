# Acceptance tests and verification walkthrough

These are the hand-calculated test oracles and interactive verification checks used to validate the solver. Use unrounded numbers internally and keep captured browser evidence separate from synthetic unit fixtures.

## Hand-calculated test oracles

| Test | Input | Expected |
|---|---|---|
| Open space can switch drivers | 400 m² residential site, GFA 800 m², roof projection 280 m² | FAR 2.00, open 120; zone needs 100, Bangkok needs 120. Both pass exactly or with slack. At GFA 1,000 with same roof: FAR 2.50 passes, zone needs 125, open 120 **fails by 5**. No sole “FAR pass” badge. |
| Nonresidential denominator | Same 400 m² site, pure office GFA 300; evaluate just the open minimum | `max(37.5, 40, 0.1 × largestPlate) = 40 m²` for plates inside the site. Changing the program must not change base zone FAR. |
| Front road-line bands alone | Enhanced-class building on W = 4, 6, 9.99, 10, 16, 20, 20.01 m | Near-edge setbacks **4, 3, 1.005, 1, 1.6, 2, 2 m**. Check actual comparisons before UI rounding. In the basic branch a 4 m road needs 1 m from the near edge. |
| Height is a plane | W=6; a point 3 m inside the near line then one 7 m inside | Max heights **18 m** and **26 m** for the road plane alone. At z=21 the minimum depth is **4.5 m**. App study height can be lower than law; never label 26 m a supported high-rise. |
| Exact section | Rectangle `(0,0),(20,0),(20,20),(0,20)`, road at `y=0`, W=6, total H=21, private openings, all-round 2 m | Before global budgets: side limits `x=[3,17]`, back `y≤17`. At z=3, `y≥3`, area **196 m²**. At z=21, `y≥4.5`, area **175 m²**. Widen to W=12: at z=21 front bound becomes `max(1.2,2,−1.5)=2`; area **210 m²**. Floor-top slices are geometric limits, not permission to stack them all. |
| Wall/setback class | Compare total H=9 vs 9.01; floor 2 vs 3; total H=15 vs 15.01 | Private opening base 2 → 3 m above 9; BMA floor 3 has 3 m even when total H=9. At 15 the all-round minimum is 1, just above 15 it is 2. At 23 m reject out-of-scope, not “3 m still enough.” |
| Area use threshold | W=15.99 then W=16; no station credit; ordinary office target 420 m² | First exceeds 300; second fits the 500 **use cap only**, not necessarily total compliance. Residential 1,000 passes base use check; 1,000.01 requires an exception and is outside the solver scope. |
| No phantom upper floors | Three nested plates of 140, 110, 80 m² at 3 m floor height | **330 m²** GFA, **9 m** height, roof projection 140, not 420. Verify sum from returned geometry and compare to ledger and map floor IDs. If a projected upper plate overhangs, reject by design, not just by its area. |
| Landscape not a label | A=400, covered 160, GFA 480 | O=240, conservative planting reservation ≥**120 m²**. A 119 m² patch fails. Patch overlapping roof or a reserved access strip is invalid even if its area is large enough. |
| Concavity | L ring `(0,0),(30,0),(30,12),(12,12),(12,30),(0,30)` | Area **576 m²** not bounding-box area 900. `(20,20)` is not land. No floor, envelope or planting appears in the missing corner. Rotate 37° and reverse winding: same local results within numerical tolerance if frontage follows. |
| Topology / empty results | Bow tie; repeated final vertex; 2 m-wide strip; dumbbell with 3 m neck and ≥2 m inward clearance | Bow tie explicitly invalid; legitimate closed ring valid; strip can lose all buildable area; neck can split into two islands with no bridge or phantom footprint. A building uses one island; geometric envelope may show both. |
| Frontage exception | Test a frontage length exactly `perimeter/8` vs slightly greater; façade at 20 m vs 20.01 m | Equality fails the strict length condition. 20 m passes the distance condition; 20.01 does not. A parcel edge on a road does not automatically exempt a rear building. |

Numerics: assert pure integer-meter arithmetic to about 0.01 m² and compare end-to-end boolean results to hand geometry within a documented small tolerance (target 0.05 m² on simple fixtures). Compare the demo area after WGS84→UTM to **453.91 m² ±0.05**. Confirm tolerance cannot turn an explicit 0.01 m use/height boundary into an allowed case: length, area and legal threshold tolerances are different. Reject NaN/Infinity. If epsilon is used for containment slivers, report its unit and test just inside and just outside. Sum displayed areas consistently; show extra precision on inspection.

## Two witnesses for the default parcel

Use these as independent feasibility checks, **not prebaked output**. Start with an idealized local copy of the supplied notch: `s=−11…11` along frontage, `d=0…22` inward, remove `s>6 AND d>16`. Area `22×22−5×6=454`. W=6, residential, floors 3 m. The real projected fixture is within 0.1 m². The long front has openings, there is one contiguous building, the front façade is wide and directly faces the street.

| | Garden bar | Stepped court |
|---|---|---|
| Lower plate | `s=[−7,5], d=[4,13]`: 12×9 | Union of `s=[−7.75,7.75], d=[3.5,12.5]` and `s=[−7.75,1.5], d=[12.5,18.5]`: 15.5×9 + 9.25×6 |
| Upper plate | Same plate for all 6 levels | 2 full lower levels, then 2 upper levels of `s=[−7.75,1.5], d=[6.5,18.5]`: 9.25×12 |
| GFA / height | 6×108 = **648 m² / 18 m** | 2×195 + 2×111 = **612 m² / 12 m** |
| Open / minimum planted | **346 / 173 m²** | **259 / 129.5 m²** |

At the front of the bar the road plane allows `2×(6+4)=20 m`, sufficient for 18 m. Both have room for separate planted ground and a clear approach. These are deliberately different, geometrically feasible concepts; they are not claims of highest yield or permit compliance. Generated alternatives can beat or differ from these numbers. If the generator can't find two on the default, debug the front normal, projection, offsets, frontage check and search placement rather than weakening rules.

## Interactive verification walkthrough

1. **Private window, normal laptop.** Open the production URL. Without setup, see named road, context buildings, footprint source, two designs and numbers with units. Orbit/pitch. Toggle A/B at the same camera; inspect a floor and compare its area to the ledger.
2. **Recompute without a reload.** Switch condo→office. Change ROW from 6 to 16. Office use cap changes 300→500, even if a different constraint keeps the achieved GFA below both. Highlight road rule: far line moves, section and relevant floor outlines update. Change to the second real street via its paired example, see a different location and facing direction. Restore first example. Camera shouldn't reset on every slider move.
3. **Actually draw.** Make a concave six-vertex parcel in the study window against a street, edit a vertex, insert/delete one, cancel a half-drawn ring, undo, reset. No geometry bridges the notch. Draw a skinny parcel, self-crossing ring and a plot across the study window; each gets its own useful state. Do not quietly keep the previous valid pass badge. Change a plot so the previously selected road is no longer adjacent.
4. **Check auditable failures.** Widen/narrow the road; inspect controlling constraint and separate nonbinding ones. Exercise an intentionally bad design in unit tests: violate sky plane, GFA budget, required open space, planting and frontage independently. A true pass/fail checklist must turn red, not merely repeat stats from the generator.
5. **Trust and offline checks.** Block all third-party requests and cold-load the app from its host; local static data still works. Click source and data-credit links. Distinguish measured vs assumed heights, legal limits vs product ceilings, and absent data vs failed checks. Use keyboard actions and check the interface at 1366×768 and at a narrow width. WebGL unavailable: readable message, assumptions and metrics; no blank page.
6. **Record actual performance, not aspirations.** Test a fresh production build with full site data, first result, repeated A/B, and 20+ rapid edits including a larger concave drawing. Target drag-to-visible-result p95 under 150 ms on the test laptop and smooth camera movement; record device/browser, input size, first result, p95 and worst sample. Count map instances and confirm no event-listener buildup after resets. If slow, first coalesce drag events, cache projection/static GeoJSON and reduce redundant candidate trials; preserve exact checks on committed edits. Do not claim a lab benchmark you did not run.

**Release blocker:** failing math, blank public map, invented site context, stale “pass,” or two identical/default-only designs. Styling enhancements never outrank those.
