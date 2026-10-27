import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const root = path.resolve(import.meta.dirname, '..')

function browser({ lang = 'es', tracker = true, consent = null } = {}) {
  const events = []
  const listeners = new Map()
  let consentValue = consent
  let mutationCallback
  const documentElement = {
    lang,
    getAttribute(name) { return name === 'lang' ? this.lang : null },
  }
  const window = {
    addEventListener(name, callback) { listeners.set(name, callback) },
    localStorage: { getItem(name) { return name === 'smf-cookie-consent' ? consentValue : null } },
  }
  function installTracker(implementation) {
    window.umami = { track(name) { events.push(name); return implementation?.(name) } }
  }
  if (tracker) installTracker()
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
    setTracker(implementation) { installTracker(implementation) },
    clearTracker() { delete window.umami },
    consent(value) { consentValue = value; listeners.get('smf:cookie-consent')?.({ detail: value }) },
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

test('an explicit rejection suppresses events and later acceptance captures the current language once', () => {
  const page = browser({ lang: 'en', tracker: false, consent: 'rejected' })
  page.ready()
  page.setTracker()
  page.consent('accepted')
  page.consent('accepted')
  assert.deepEqual(page.events, ['page-language:en'])
})

test('returning to the last tracked language clears a stale pending change', () => {
  const page = browser({ lang: 'es' })
  page.ready()
  page.clearTracker()
  page.change('en')
  page.change('es')
  page.setTracker()
  page.load()
  assert.deepEqual(page.events, ['page-language:es'])
})

test('a rejected asynchronous Umami request is handled without marking the event complete', async () => {
  const page = browser({ lang: 'fi', tracker: false })
  page.setTracker(() => Promise.reject(new Error('blocked tracker')))
  page.ready()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(page.events, ['page-language:fi'])
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
    assert.match(html, /<script defer src="\/umami-loader\.js" data-website-id="59a72488-a454-4caf-962d-e9b4c2589710" data-script-url="https:\/\/analytics\.187\.124\.55\.36\.sslip\.io\/script\.js"><\/script>/)
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

test('the Umami loader honors rejection and starts only once after a later acceptance', () => {
  const listeners = new Map()
  const appended = []
  const dispatched = []
  let consent = 'rejected'
  const config = {
    getAttribute(name) {
      if (name === 'data-website-id') return '59a72488-a454-4caf-962d-e9b4c2589710'
      if (name === 'data-script-url') return 'https://analytics.187.124.55.36.sslip.io/script.js'
      return null
    },
  }
  const window = {
    localStorage: { getItem() { return consent } },
    addEventListener(name, callback) { listeners.set(name, callback) },
    dispatchEvent(event) { dispatched.push(event.type) },
  }
  const document = {
    currentScript: config,
    createElement() {
      const loadListeners = new Map()
      const attributes = new Map()
      return {
        attributes,
        setAttribute(name, value) { attributes.set(name, value) },
        addEventListener(name, callback) { loadListeners.set(name, callback) },
        load() { loadListeners.get('load')?.() },
      }
    },
    head: { appendChild(script) { appended.push(script) } },
  }
  const source = fs.readFileSync(path.join(root, 'umami-loader.js'), 'utf8')
  vm.runInNewContext(source, { window, document, Event: class Event { constructor(type) { this.type = type } } })
  assert.equal(appended.length, 0)

  consent = 'accepted'
  listeners.get('smf:cookie-consent')?.({ detail: 'accepted' })
  listeners.get('smf:cookie-consent')?.({ detail: 'accepted' })
  assert.equal(appended.length, 1)
  assert.equal(appended[0].src, 'https://analytics.187.124.55.36.sslip.io/script.js')
  assert.equal(appended[0].attributes.get('data-website-id'), '59a72488-a454-4caf-962d-e9b4c2589710')
  assert.equal(appended[0].attributes.get('data-do-not-track'), 'true')
  appended[0].load()
  assert.deepEqual(dispatched, ['umami:ready'])
})

test('the cookie banner announces acceptance and rejection to the analytics gate', () => {
  for (const relative of [
    'cookie-banner-core.js',
    'index.html',
    'legal.html',
    'propuesta/moderno/index.html',
    'propuesta/creativa/index.html',
    'propuesta/color-diferente/index.html',
  ]) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8')
    assert.match(source, /smf:cookie-consent/, relative)
    assert.match(source, /detail:\s*['"]accepted['"]/, relative)
    assert.match(source, /detail:\s*['"]rejected['"]/, relative)
  }
})
