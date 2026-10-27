import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PUBLIC_ROOTS = ['index.html', 'legal.html', 'blog', 'propuesta']
const LANGUAGE_HELPER = '<script defer src="/language-analytics.js"></script>'
const DISCLOSURES = [
  ['Actualmente no hay analítica activa ni cookies publicitarias. Si se activa Umami, medirá visitas agregadas y respetuosas con la privacidad sin cookies ni perfiles personales.', 'Umami está activo y mide visitas agregadas respetuosas con la privacidad, sin cookies ni perfiles personales.'],
  ['Analytics is currently disabled and no advertising cookies are used. If Umami is activated, it will measure aggregate, privacy-friendly visits without cookies or personal profiles.', 'Umami analytics is active and measures aggregate, privacy-friendly visits without cookies or personal profiles.'],
  ['Analytiikka ei ole tällä hetkellä käytössä eikä sivusto käytä mainosevästeitä. Jos Umami otetaan käyttöön, se mittaa koottuja käyntejä yksityisyyttä kunnioittaen ilman evästeitä tai henkilöprofiileja.', 'Umami-analytiikka on käytössä ja mittaa koottuja käyntejä yksityisyyttä kunnioittaen ilman evästeitä tai henkilöprofiileja.'],
  ['La analítica está desactivada. Si se activa Umami, medirá visitas agregadas sin cookies ni perfiles personales.', 'Umami está activo y mide visitas agregadas sin cookies ni perfiles personales.'],
  ['Analytics is disabled. If Umami is activated, it will measure aggregate visits without cookies or personal profiles.', 'Umami analytics is active and measures aggregate visits without cookies or personal profiles.'],
  ['Analytiikka ei ole käytössä. Jos Umami otetaan käyttöön, se mittaa koottuja käyntejä ilman evästeitä tai henkilöprofiileja.', 'Umami-analytiikka on käytössä ja mittaa koottuja käyntejä ilman evästeitä tai henkilöprofiileja.'],
]

function publicHtmlFiles(root) {
  const files = []
  function visit(candidate) {
    if (!fs.existsSync(candidate)) return
    const stat = fs.lstatSync(candidate)
    if (stat.isSymbolicLink()) throw new Error(`Public analytics path must not be a symlink: ${candidate}`)
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(candidate)) visit(path.join(candidate, entry))
    } else if (stat.isFile() && candidate.endsWith('.html')) {
      files.push(candidate)
    }
  }
  for (const relative of PUBLIC_ROOTS) visit(path.join(root, relative))
  return files
}

function verifiedTracker(websiteId, scriptUrl, verified) {
  if (verified !== true || !UUID_PATTERN.test(websiteId ?? '')) throw new Error('Verified Umami website ID is required for Pages')
  const parsed = new URL(scriptUrl)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Verified HTTPS Umami script URL is required for Pages')
  const safeUrl = parsed.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return `<script defer src="${safeUrl}" data-website-id="${websiteId}"></script>`
}

export function preparePagesAnalytics({ root, websiteId, scriptUrl, verified = false }) {
  const sourceRoot = path.resolve(root)
  const tracker = verifiedTracker(websiteId, scriptUrl, verified)
  const files = publicHtmlFiles(sourceRoot)
  if (!files.length) throw new Error('No public HTML files found for Pages analytics')

  for (const file of files) {
    let html = fs.readFileSync(file, 'utf8')
    const configuredId = html.match(/data-website-id="([^"]+)"/)?.[1]
    if (configuredId && configuredId !== websiteId) throw new Error(`Conflicting Umami website ID in ${file}`)
    if (!configuredId) {
      if (!html.includes('</head>')) throw new Error(`Public HTML is missing </head>: ${file}`)
      html = html.includes(LANGUAGE_HELPER)
        ? html.replace(LANGUAGE_HELPER, `${tracker}\n  ${LANGUAGE_HELPER}`)
        : html.replace('</head>', `  ${tracker}\n</head>`)
    }
    for (const [inactive, active] of DISCLOSURES) html = html.replaceAll(inactive, active)
    fs.writeFileSync(file, html)
  }
  return files.map((file) => path.relative(sourceRoot, file))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  preparePagesAnalytics({
    root: process.cwd(),
    websiteId: process.env.UMAMI_WEBSITE_ID,
    scriptUrl: process.env.UMAMI_SCRIPT_URL,
    verified: process.env.UMAMI_PRODUCTION_VERIFIED === 'true',
  })
}
