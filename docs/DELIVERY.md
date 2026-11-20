# Delivery notes & verification evidence

The [README](../README.md) explains the problem, geometry pipeline, and headline results. This page collects the visual captures, drag-latency benchmarks, and engineering trade-offs from the production build.

## Captured screens

| View | Screenshot |
|---|---|
| Desktop workspace on Soi Ramkhamhaeng 144 | [`evidence/studio-desktop.png`](evidence/studio-desktop.png) |
| Narrow 390 px mobile layout | [`evidence/studio-mobile.png`](evidence/studio-mobile.png) |
| Four fitted massing concepts & same-camera comparison | [`evidence/06-four-options.png`](evidence/06-four-options.png) |
| Site due-diligence screens & evidence checklist | [`evidence/07-due-diligence.png`](evidence/07-due-diligence.png) |
| Default 3D view (Garden Bar) | [`evidence/01-default.png`](evidence/01-default.png) |
| Stepped Court, floor slice & perpendicular road section | [`evidence/02-alternative.png`](evidence/02-alternative.png) |
| Live A/B comparison with same-scale plan drawings | [`evidence/04-compare.png`](evidence/04-compare.png) |
| Guided road-width what-if & interactive height probe | [`evidence/05-guided-road.png`](evidence/05-guided-road.png) |

## Measured performance

All measurements run against the production bundle (`npm run build`) served under `/plot-study/` in a fresh headless Chromium 155 instance (`1366×768`, Intel Core i7-12700K, 31 GiB RAM, Linux, SwiftShader WebGL) with all third-party network requests blocked.

The drag benchmark (`?measure`, raw log in [`evidence/timings.json`](evidence/timings.json)) draws a 12-vertex concave parcel and executes 24 pointer moves spaced 68 ms apart. It records both the React DOM commit frame (`ui`) and the MapLibre WebGL render frame after `source.setData` (`map`):

| Release stage | Unit tests | Browser E2E tests | Cold load to first 3D result | UI commit (p95 / worst) | MapLibre WebGL render (p95 / worst) |
|---|---:|---:|---:|---:|---:|
| Base solver + 2 concepts | 10 | 4 | 451 ms | 25.5 ms / 31.3 ms | 47.2 ms / 50.3 ms |
| Guided tour + height probe | 10 | 7 | 499 ms | 25.4 ms / 31.4 ms | 46.5 ms / 50.4 ms |
| Studio cutaway + solar + SVG | 13 | 9 | 465 ms | 35.0 ms / 46.9 ms | 57.1 ms / 81.3 ms |
| **4 concepts + due diligence** | **17** | **11** | **483 ms** | **37.6 ms / 42.5 ms** | **69.6 ms / 83.6 ms** |

One MapLibre GL instance stays alive across all scenario switches, street changes, and resets (`window.plotStudyDebug.instances === 1`).

## What the verification suite tests

- **Unit oracles (`tests/engine.test.ts`, `tests/diligence.test.ts`, `tests/shadow.test.ts`):**
  - Hand-calculated open-space denominator switches (`B-OPEN` 30% of land vs `Z-OSR` 12.5% of GFA vs `N-OPEN` 30% of largest plate).
  - Exact front setback step bands across `W = 4, 6, 9.99, 10, 16, 20, 20.01 m` and 2:1 sky-plane depths.
  - Strict boundary checks at `9 m vs 9.01 m`, `15 m vs 15.01 m`, `22.99 m vs 23 m`, `15.99 m vs 16 m` (office cap `300 -> 500 m²`), and `29.99 m vs 30 m` (condo cap `1,000 -> 10,000 m²`).
  - Deliberately invalid candidates: 1 cm sky-plane violation, 1 m² planting shortfall, planting overlapping the entry walk, overhanging upper floor, bow-tie self-intersection, and skinny 2 m strip.
  - Rotation and winding invariance (`37°` rotation + reversed ring order on a concave L-plot).
  - Equinox shadow vector geometry, courtyard preservation at noon, and floor-cutaway invariance.
  - BMA §83 parking triggers, MR 55 §27 fire-stair triggers, ONEP EIA thresholds, rear easement clipping, and 90° stall packing.
- **Browser E2E (`tests/browser/study.spec.ts`, `tests/browser/drawing.spec.ts`, `tests/browser/diligence.spec.ts`):**
  - Cold load with third-party requests aborted; verifies 94 OSM roads and 559 Overture footprints load locally.
  - Same-camera A/B/C/D concept switching, floor cutaway, equinox sun study, and standalone SVG sheet download.
  - Live drawing of a 12-vertex concave plot, vertex drag timing, vertex insertion/removal, undo, and error states for bow-tie, skinny, non-fronting, and out-of-window plots.
  - Mobile `390×844` layout with zero horizontal overflow, keyboard probe scrubbing, and graceful WebGL-disabled fallback.

## Engineering trade-offs

| Decision | Why we made it & what it trades off |
|---|---|
| Local GeoJSON extracts for two Saphan Sung streets instead of live GIS | Zero network latency or brittle Overpass/BMA GIS calls. Adjacency uses a 3-point distance and orientation check against the mapped OSM centerline. Corner lots touching a second public street withhold fits rather than running a single-frontage approximation. |
| Deterministic street-aligned template search + independent polygon verifier | Evaluates in under 40 ms on the main thread during live vertex drags and guarantees every displayed floorplate passes all 16 checks. It is a bounded heuristic search (up to 80 vertices, `< 23 m`, `<= 1,000 m²` GFA), not a global solver over arbitrary freeform towers. |
| Uniform 6 m neighbor extrusion with a 1-click flatten toggle | None of the 559 Overture footprints carry height attributes. Showing a labeled 6 m massing gives real street enclosure without inventing fake storey counts. |
| Separate due-diligence screens below the massing workspace | Keeps early checks (BMA §83 parking bays, straight fire approach, MR 55 §27 escape stair, ONEP EIA size threshold, rear easement strip) useful without conflating geometric massing fits with full building-permit compliance. |
