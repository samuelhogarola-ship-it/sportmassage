import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const html = fs.readFileSync(path.resolve('admin/blogger/index.html'), 'utf8')
const target = 'https://portal.webfuengirola.com/acceso/blogger/sportmassagefuengirola'

test('Sport Massage Blogger entry is an English gateway to the existing neutral-host tool', () => {
  assert.match(html, /<html lang="en">/)
  assert.match(html, new RegExp(target.replaceAll('.', '\\.')))
  assert.match(html, /location\.replace/)
  assert.match(html, />Continue to Blogger</)
})

test('gateway contains no second login, editor, API, or owner-admin URL', () => {
  assert.doesNotMatch(html, /<form|type="password"|bloggerLogin|app\.js|blogger-auth|\/api\/|admin\.webfuengirola\.com/i)
})
