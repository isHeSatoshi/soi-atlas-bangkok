import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { frame, toLocal, toWorld, type Point, type Ring } from '../../src/domain/geo'
import { readFileSync } from 'node:fs'
const fixtures = JSON.parse(readFileSync(new URL('../../planning/evidence/example-plots.geojson', import.meta.url), 'utf8'))
const original: Ring = fixtures.features[0].geometry.coordinates[0].slice(0, -1)
const f = frame(toLocal(original[0]), toLocal(original[1]), false)
const world = (s: number, d: number) => toWorld(f.from(s, d))
const screenshots = process.env.CAPTURE_EVIDENCE === '1'
const evidence = 'docs/evidence'

async function plotted(page: Page) {
  await expect(page.getByTestId('site-area')).toHaveText('453.91 m²')
  await expect(page.getByText('Fits the modeled rules', { exact: true })).toBeVisible()
  await page.waitForFunction(() => Boolean(window.plotStudyDebug?.firstMs), { timeout: 15_000 })
}
async function plotPoint(page: Page, coords: Point): Promise<Point> {
  const box = await page.getByTestId('map-canvas').boundingBox()
  const p = await page.evaluate(p => window.plotStudyDebug!.project!(p), coords)
  return [p[0] + box!.x, p[1] + box!.y]
}
async function draw(page: Page, vertices: Ring) {
  await page.getByRole('button', { name: 'Draw new plot' }).click()
  for (const p of vertices) {
    const point = await plotPoint(page, p)
    await page.mouse.click(...point)
  }
  await expect(page.getByText(`${vertices.length} vertices`, { exact: false })).toBeVisible()
  await page.keyboard.press('Enter')
}
async function shot(page: Page, name: string, fullPage = false) {
  if (!screenshots) return
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage, animations: 'disabled' })
}
async function demoShot(page: Page, name: string, fullPage = false) {
  if (process.env.CAPTURE_DEMO !== '1') return
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage, animations: 'disabled' })
}
test('cold production load with third parties blocked, concepts, road, source links, and local context', async ({ page, baseURL }) => {
  const external: string[] = [], errors: string[] = []
  let requests = 0
  page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) requests++ })
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    external.push(url.href)
    return route.abort()
  })
  await page.goto('./?measure')
  await plotted(page)
  expect(await page.evaluate(() => window.plotStudyDebug!.counts)).toEqual([94, 559])
  const active = page.locator('.concept-card.current')
  const a = await active.innerText()
  await shot(page, '01-default')
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /Stepped Court/ }).click()
    await expect(active).toContainText('Stepped Court')
    expect(await active.innerText()).not.toBe(a)
    await page.getByRole('button', { name: /Garden Bar/ }).click()
    await expect(active).toContainText('Garden Bar')
  }
  await page.getByRole('button', { name: /Stepped Court/ }).click()
  await page.getByRole('button', { name: 'Envelope', exact: true }).click()
  await page.getByRole('combobox', { name: 'Envelope slice' }).selectOption('3')
  await page.getByRole('button', { name: 'Inspect floor 4' }).click()
  await expect(page.getByRole('button', { name: 'Inspect floor 4' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /Road height plane/ }).click()
  await expect(page.locator('#rule-B\\/N-SKY')).toContainText('Thai text')
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await shot(page, '02-alternative', true)
  await page.getByRole('button', { name: 'Office', exact: true }).click()
  await expect(page.locator('.budgets')).toContainText('300')
  await page.getByRole('spinbutton', { name: 'Public ROW width' }).fill('16')
  await expect(page.locator('.budgets')).toContainText('500')
  await expect(page.locator('#road-section').getByText('16 m ROW', { exact: true })).toBeVisible()
  await expect(page.locator('.row-dimension text')).toHaveText('16 m ROW')
  await page.getByRole('spinbutton', { name: 'Public ROW width' }).fill('15.99')
  await expect(page.locator('.budgets')).toContainText('300')
  await page.getByText('Road & frontage', { exact: true }).click()
  await page.getByLabel('Compare another street').selectOption('1')
  await page.getByRole('button', { name: 'Load example' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Soi Ramkhamhaeng 142/1.')
  await expect(page.getByText('Fits the modeled rules', { exact: true })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Public ROW width' })).toHaveValue('8')
  await page.getByRole('button', { name: 'Reset example' }).click()
  await plotted(page)
  await page.getByRole('button', { name: 'Flatten context' }).click()
  await expect(page.getByRole('button', { name: 'Show 6 m context' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Planning map, sheet 8' })).toHaveAttribute('href', /mr56-bma-08b\.jpg$/)
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1)
  expect(await page.evaluate(() => window.plotStudyDebug!.instances)).toBe(1)
  expect(external).toEqual([])
  expect(errors).toEqual([])
  expect(requests).toBe(1)
})

test('plot drawing, editing, failures and a 24-step drag timing run', async ({ page }) => {
  await page.goto('./?measure')
  await plotted(page)
  await page.getByRole('button', { name: 'Draw / edit plot' }).click()
  const larger = [[0, 0], [24, 0], [24, 23], [20, 23], [20, 20], [17, 20], [17, 24], [14, 24], [14, 22], [10, 22], [10, 28], [0, 28]].map(([s, d]) => world(s, d))
  await draw(page, larger)
  await expect(page.getByText('Fits the modeled rules', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Vertex \d+$/ })).toHaveCount(12)
  const areaBefore = await page.getByTestId('site-area').innerText()
  const handle = page.getByRole('button', { name: 'Vertex 12', exact: true })
  const b = await handle.boundingBox()
  const xy: Point = [b!.x + b!.width / 2, b!.y + b!.height / 2]
  await page.mouse.move(...xy)
  await page.waitForTimeout(250)
  const before = await page.evaluate(() => window.plotStudyDebug!.events.length)
  const beforeUI = await page.evaluate(() => window.plotStudyDebug!.ui.length)
  await page.mouse.down()
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(xy[0] + (i % 2 === 0 ? 6 : -4), xy[1] + 3 + i * 0.5)
    await page.waitForTimeout(68)
  }
  await page.mouse.up()
  await expect(page.getByTestId('site-area')).not.toHaveText(areaBefore)
  await page.waitForFunction(() => {
    const { events, ui } = window.plotStudyDebug!
    return events.at(-1)?.revision === ui.at(-1)?.revision
  })
  const timings = await page.evaluate(({ before, beforeUI }) => {
    const { events, ui, firstMs, instances } = window.plotStudyDebug!
    const stats = (arr: { ms: number }[]) => {
      const xs = arr.map(e => e.ms).sort((a, b) => a - b)
      return { samples: xs.length, p95Ms: xs[Math.ceil(xs.length * 0.95) - 1], worstMs: xs.at(-1) }
    }
    return { firstMs, map: stats(events.slice(before)), ui: stats(ui.slice(beforeUI)), instances, userAgent: navigator.userAgent }
  }, { before, beforeUI })
  console.log('Drag timings:', timings)
  expect(timings.ui.samples).toBeGreaterThanOrEqual(20)
  expect(timings.map.samples).toBeGreaterThan(0)
  expect(timings.instances).toBe(1)
  if (screenshots) {
    await mkdir(evidence, { recursive: true })
    await writeFile(`${evidence}/timings.json`, `${JSON.stringify(timings, null, 2)}\n`)
  }
  await page.getByRole('button', { name: 'Insert vertex' }).click()
  await expect(page.getByRole('button', { name: /^Vertex \d+$/ })).toHaveCount(13)
  await page.getByRole('button', { name: 'Remove vertex' }).click()
  await expect(page.getByRole('button', { name: /^Vertex \d+$/ })).toHaveCount(12)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Vertex \d+$/ })).toHaveCount(13)
  await page.getByRole('button', { name: 'Draw new plot' }).click()
  await page.mouse.click(...await plotPoint(page, world(4, 4)))
  await expect(page.getByText(/Last valid geometry is a preview only/)).toBeVisible()
  await expect(page.getByText('Fits the modeled rules', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByText('Fits the modeled rules', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Draw / edit plot' }).click()
  await draw(page, [[0, 0], [24, 16], [0, 16], [24, 0]].map(([s, d]) => world(s, d)))
  await expect(page.getByText(/Plot edges cross/)).toBeVisible()
  await expect(page.getByText('Fits the modeled rules', { exact: true })).toHaveCount(0)
  await draw(page, [[0, 0], [24, 0], [24, 1.7], [0, 1.7]].map(([s, d]) => world(s, d)))
  await expect(page.getByText(/Setbacks leave no buildable area/)).toBeVisible()
  await draw(page, [[0, 11], [22, 11], [22, 19], [0, 19]].map(([s, d]) => world(s, d)))
  await expect(page.getByText(/New frontage needed/)).toBeVisible()
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await page.waitForTimeout(450)
  await draw(page, [[100.69340, 13.78516], [100.69350, 13.78516], [100.69350, 13.78526], [100.69340, 13.78526]])
  await expect(page.getByText(/Outside the supported study area/)).toBeVisible()
  await expect(page.getByText('Fits the modeled rules', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Reset example' }).click()
  await plotted(page)
})

test('narrow viewport and keyboard navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./?measure')
  await plotted(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole('button', { name: 'Plan', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await shot(page, '03-mobile', true)
})

test('calculator remains visible without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return type.startsWith('webgl') ? null : Reflect.apply(get, this, [type, ...args])
    } as typeof get
  })
  await page.goto('./')
  await expect(page.getByText('3D map unavailable')).toBeVisible()
  await expect(page.getByTestId('site-area')).toHaveText('453.91 m²')
  await expect(page.getByRole('button', { name: /Garden Bar/ })).toBeVisible()
  await page.getByRole('button', { name: 'Office', exact: true }).click()
  await expect(page.locator('.budgets')).toContainText('300')
})

test('live A/B plans keep the camera still and report the geometry trade-off', async ({ page }) => {
  await page.goto('./?measure')
  await plotted(page)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  const compare = page.getByRole('region', { name: 'Same-scale concept comparison' })
  await expect(compare).toContainText('−118.3 m²')
  await expect(compare).toContainText('−3 m')
  // The six equal Garden Bar plates cover ~982.3 / 6 m², leaving ~290.2 m².
  await expect(page.locator('.concept-card').filter({ hasText: 'Garden Bar' })).toContainText('290.2 m² open ground')
  await expect(compare).toContainText('−39.3 m²')
  const pixel = () => page.evaluate(p => window.plotStudyDebug!.project!(p), original[0])
  const before = await pixel()
  const plans = compare.locator('svg')
  expect(await plans.nth(0).locator('path').first().getAttribute('d')).toBe(await plans.nth(1).locator('path').first().getAttribute('d'))
  expect(await plans.nth(0).locator('path').nth(2).getAttribute('d')).not.toBe(await plans.nth(1).locator('path').nth(2).getAttribute('d'))
  await compare.getByRole('button', { name: 'View Stepped Court in the same camera' }).click()
  await expect(page.locator('.concept-card.current')).toContainText('Stepped Court')
  expect(await pixel()).toEqual(before)
  await expect(page.getByText('Other footprint', { exact: true })).toBeVisible()
  if (process.env.CAPTURE_DEMO === '1') {
    await page.setViewportSize({ width: 1366, height: 950 })
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await demoShot(page, '04-compare')
  }
  await page.getByRole('spinbutton', { name: 'Public ROW width' }).fill('0')
  await expect(compare).toHaveCount(0)
  await expect(page.getByText('Other footprint', { exact: true })).toHaveCount(0)
})

test('guided demo changes the real masks and use cap, and restores the working scenario', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./?measure')
  await plotted(page)
  await page.getByRole('spinbutton', { name: 'Public ROW width' }).fill('8.25')
  await page.getByRole('button', { name: 'Office', exact: true }).click()
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  const enter = page.getByRole('button', { name: 'Guided demo', exact: true })
  await enter.click()
  const walk = page.getByRole('region', { name: 'Start with the site' })
  await expect(walk).toContainText('453.91 m²')
  await expect(page.getByRole('button', { name: '3D', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const next = page.getByRole('button', { name: 'Next step' })
  await next.click()
  await page.getByRole('button', { name: 'Show Stepped Court' }).click()
  await expect(page.locator('.concept-card.current')).toContainText('Stepped Court')
  await next.click()
  const road = page.getByRole('region', { name: 'See the road set the height' })
  await expect(road).toContainText('4.5 m minimum depth at 21 m')
  await expect(page.getByText('18 m road-plane height')).toBeVisible()
  await expect(page.getByText('Section probe', { exact: true })).toBeVisible()
  await road.getByRole('button', { name: 'Try 12 m ROW' }).click()
  await expect(road).toContainText('2 m minimum depth at 21 m')
  await expect(page.getByText('30 m road-plane height')).toBeVisible()
  await demoShot(page, '05-guided-road', true)
  await next.click()
  const office = page.getByRole('region', { name: 'Find the office threshold' })
  await expect(office).toContainText('300 m² use cap · 1,134.8 m² base FAR')
  await office.getByRole('button', { name: 'Try 16 m ROW', exact: true }).click()
  await expect(office).toContainText('500 m² use cap · 1,134.8 m² base FAR')
  await office.getByRole('button', { name: 'Finish demo' }).click()
  await expect(enter).toBeFocused()
  await expect(page.getByRole('spinbutton', { name: 'Public ROW width' })).toHaveValue('8.25')
  await expect(page.getByRole('button', { name: 'Office', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => window.plotStudyDebug!.instances)).toBe(1)
  await enter.click()
  await page.keyboard.press('Escape')
  await expect(enter).toHaveAttribute('aria-pressed', 'false')
})

test('the height probe can be scrubbed from the keyboard on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./?measure')
  await plotted(page)
  await page.getByRole('button', { name: 'Show probe' }).click()
  const probe = page.getByRole('slider', { name: /Depth from near ROW/ })
  await expect(page.getByText('18 m road-plane height')).toBeVisible()
  await probe.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('18.2 m road-plane height')).toBeVisible()
  await page.getByRole('button', { name: 'Hide probe' }).click()
  await expect(probe).toHaveCount(0)
  await page.getByRole('button', { name: 'Guided demo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Next step' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})
