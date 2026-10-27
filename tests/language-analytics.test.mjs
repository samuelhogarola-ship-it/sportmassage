import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const root = path.resolve(import.meta.dirname, '..')

function browser({ lang = 'es', tracker = true } = {}) {
  const events = []
  const listeners = new Map()
  let mutationCallback
  const documentElement = {
    lang,
    getAttribute(name) { return name === 'lang' ? this.lang : null },
  }
  const window = {
    addEventListener(name, callback) { listeners.set(name, callback) },
  }
  if (tracker) window.umami = { track(name) { events.push(name) } }
  const document = {
    documentElement,
    readyState: 'loading',
    addEventListener(name, callback) { listeners.set(name, callback) },
  }
  class MutationObserver {
    constructor(callback) { mutationCallback = callback }
    observe(target, options) {
      assert.equal(target, documentElement)
      assert.equal(options.attributes, true)
      assert.equal(Array.from(options.attributeFilter).join(','), 'lang')
    }
  }
  const source = fs.readFileSync(path.join(root, 'language-analytics.js'), 'utf8')
  vm.runInNewContext(source, { window, document, MutationObserver })
  return {
    events,
    documentElement,
    setTracker() { window.umami = { track(name) { events.push(name) } } },
    ready() { listeners.get('DOMContentLoaded')?.() },
    load() { listeners.get('load')?.() },
    change(nextLang) {
      documentElement.lang = nextLang
      mutationCallback([{ type: 'attributes', attributeName: 'lang' }])
    },
  }
}

test('tracks initial content language and each real change once', () => {
  const page = browser({ lang: 'es' })
  page.ready()
  page.change('es')
  page.change('en')
  page.change('en-GB')
  page.change('fi-FI')
  page.change('de')
  assert.deepEqual(page.events, ['page-language:es', 'page-language:en', 'page-language:fi'])
})

test('waits for the existing Umami tracker and sends no personal or page data', () => {
  const page = browser({ lang: 'en', tracker: false })
  assert.doesNotThrow(() => page.ready())
  assert.deepEqual(page.events, [])
  page.setTracker()
  page.load()
  assert.deepEqual(page.events, ['page-language:en'])
})

test('every tracked public HTML route loads the shared language helper', () => {
  const publicHtml = [
    'index.html',
    'legal.html',
    'blog/index.html',
    'blog/automatic-translation-test-2026-10-27/index.html',
    'blog/automatic-translation-test-2026-10-27/es/index.html',
    'blog/automatic-translation-test-2026-10-27/fi/index.html',
    'propuesta/moderno/index.html',
    'propuesta/creativa/index.html',
    'propuesta/color-diferente/index.html',
  ]
  for (const relative of publicHtml) {
    const html = fs.readFileSync(path.join(root, relative), 'utf8')
    assert.match(html, /<script defer src="\/language-analytics\.js"><\/script>/, relative)
    assert.match(html, /<html lang="(?:es|en|fi)">/, relative)
  }
})

test('the Pages release activates the verified cookie-free Umami tracker without touching admin', async (t) => {
  const { preparePagesAnalytics } = await import('../scripts/prepare-pages-analytics.mjs')
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sportmassage-pages-'))
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }))
  fs.mkdirSync(path.join(fixture, 'blog/post'), { recursive: true })
  fs.mkdirSync(path.join(fixture, 'admin/blogger'), { recursive: true })
  const languageHelper = '<script defer src="/language-analytics.js"></script>'
  const inactive = `<html><head>${languageHelper}</head><body>Analytics is currently disabled and no advertising cookies are used. If Umami is activated, it will measure aggregate, privacy-friendly visits without cookies or personal profiles.</body></html>`
  fs.writeFileSync(path.join(fixture, 'index.html'), inactive)
  fs.writeFileSync(path.join(fixture, 'blog/post/index.html'), inactive)
  fs.writeFileSync(path.join(fixture, 'admin/blogger/index.html'), inactive)

  preparePagesAnalytics({
    root: fixture,
    websiteId: '59a72488-a454-4caf-962d-e9b4c2589710',
    scriptUrl: 'https://analytics.187.124.55.36.sslip.io/script.js',
    verified: true,
  })

  for (const relative of ['index.html', 'blog/post/index.html']) {
    const html = fs.readFileSync(path.join(fixture, relative), 'utf8')
    assert.match(html, /<script defer src="https:\/\/analytics\.187\.124\.55\.36\.sslip\.io\/script\.js" data-website-id="59a72488-a454-4caf-962d-e9b4c2589710"><\/script>/)
    assert.ok(html.indexOf('data-website-id=') < html.indexOf('/language-analytics.js'))
    assert.match(html, /Umami analytics is active and measures aggregate, privacy-friendly visits without cookies or personal profiles\./)
  }
  assert.equal(fs.readFileSync(path.join(fixture, 'admin/blogger/index.html'), 'utf8'), inactive)
})

test('GitHub Pages prepares analytics before uploading the unchanged static tree', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8')
  assert.match(workflow, /UMAMI_WEBSITE_ID:\s*59a72488-a454-4caf-962d-e9b4c2589710/)
  assert.match(workflow, /UMAMI_SCRIPT_URL:\s*https:\/\/analytics\.187\.124\.55\.36\.sslip\.io\/script\.js/)
  assert.ok(workflow.indexOf('npm run prepare:pages') < workflow.indexOf('uses: actions/upload-pages-artifact@'))
  assert.match(workflow, /path:\s*\./)
})

test('the Pages preparation fails closed without verified production configuration', async (t) => {
  const { preparePagesAnalytics } = await import('../scripts/prepare-pages-analytics.mjs')
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sportmassage-pages-invalid-'))
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }))
  fs.writeFileSync(path.join(fixture, 'index.html'), '<html><head></head><body></body></html>')

  assert.throws(() => preparePagesAnalytics({
    root: fixture,
    websiteId: 'not-a-website-id',
    scriptUrl: 'http://analytics.example/script.js',
    verified: false,
  }), /Verified Umami website ID is required/)
  assert.doesNotMatch(fs.readFileSync(path.join(fixture, 'index.html'), 'utf8'), /data-website-id/)
})
