import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('model cutaway, solar study and measured SVG export follow the active project',async({page})=>{
  await page.goto('./?measure')
  const sun=page.getByRole('button',{name:'Sun study',exact:true})
  await sun.click()
  await page.getByRole('button',{name:'3 pm',exact:true}).click()
  await expect(page.getByRole('button',{name:'3 pm',exact:true})).toHaveAttribute('aria-pressed','true')
  const card=page.locator('.concept-card.current')
  await expect(card).toContainText('982.3')
  await page.getByRole('button',{name:'Cut at floor 2',exact:true}).click()
  await expect(page.locator('.cut-label output')).toContainText('F2')
  await expect(page.getByText('Cutaway shadow',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Inspect floor 2'})).toHaveAttribute('aria-pressed','true')
  await expect(card).toContainText('982.3')
  await page.getByRole('button',{name:'Restore full model'}).click()
  await expect(page.locator('.cut-label output')).toHaveText('Full model')
  await sun.click()
  if(process.env.CAPTURE_STUDIO==='1') await page.screenshot({path:'docs/evidence/studio-desktop.png',animations:'disabled'})
  await page.getByRole('button',{name:/Stepped Court/}).click()
  const wait=page.waitForEvent('download')
  await page.getByRole('button',{name:'Download drawing'}).click()
  const dl=await wait
  expect(dl.suggestedFilename()).toBe('soi-atlas-144-condo-study.svg')
  const xml=await readFile((await dl.path())!,'utf8')
  const info=await page.evaluate(s=>{
    const doc=new DOMParser().parseFromString(s,'image/svg+xml')
    const areas=Array.from(doc.querySelectorAll('text')).filter(t=>t.textContent?.endsWith('m² gross floor area')).map(t=>Number.parseFloat(t.textContent!))
    return {valid:!doc.querySelector('parsererror'),models:doc.querySelectorAll('.axon').length,areas}
  },xml)
  expect(info.valid).toBe(true);expect(info.models).toBe(4)
  expect(info.areas[0]).toBeCloseTo(982.3,1);expect(info.areas[1]).toBeCloseTo(864,1)
  expect(await page.evaluate(s => {
    const doc = new DOMParser().parseFromString(s, 'image/svg+xml')
    return { height: Number(doc.documentElement.getAttribute('height')), names: doc.documentElement.textContent ?? '' }
  }, xml)).toMatchObject({ height: 1140, names: expect.stringMatching(/STREET PAVILION.*SKY LANTERN/s) })
  await page.getByRole('spinbutton',{name:'Public ROW width'}).fill('0')
  await expect(page.locator('.sheet-download')).toHaveCount(0)
  await expect(page.locator('.cut-control')).toHaveCount(0)
  await expect(sun).toHaveCount(0)
})

test('studio controls fit on mobile and survive concept and camera changes',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.goto('./?measure')
  await page.getByRole('button',{name:'Plan',exact:true}).click()
  await page.getByRole('button',{name:'Sun study'}).click()
  await page.getByRole('button',{name:'Noon',exact:true}).click()
  await page.getByRole('button',{name:'Cut at floor 3'}).click()
  await expect(page.locator('.cut-label output')).toContainText('F3')
  await page.getByRole('button',{name:/Stepped Court/}).click()
  await expect(page.locator('.cut-label output')).toHaveText('Full model')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390)
  if(process.env.CAPTURE_STUDIO==='1'){
    await page.getByRole('button',{name:'3D',exact:true}).click()
    await page.getByRole('button',{name:'Sun study'}).click()
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}))
    await page.screenshot({path:'docs/evidence/studio-mobile.png',fullPage:true})
  }
})
