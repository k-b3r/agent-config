import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const INSTALL = join(ROOT, 'install.sh')

// install.sh writes only under $HOME, so a temp HOME keeps the run away from the real config.
function withHome(run) {
  const home = mkdtempSync(join(tmpdir(), 'agent-config-install-'))
  try {
    run(home, () => execFileSync('bash', [INSTALL], { env: { ...process.env, HOME: home }, encoding: 'utf8' }))
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

const isLink = (path) => lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() === true

test('install.sh links pi-sync on a machine that has no ~/.local/bin yet', () => {
  withHome((home, install) => {
    install()
    assert.equal(readlinkSync(join(home, '.local', 'bin', 'pi-sync')), join(ROOT, 'scripts', 'pi-sync.mjs'))
  })
})

test('install.sh removes a link to a skill or extension this repo no longer has', () => {
  withHome((home, install) => {
    mkdirSync(join(home, '.pi', 'agent'), { recursive: true })
    install()
    const stale = [
      [join(home, '.claude', 'skills', 'renamed-away'), join(ROOT, 'skills', 'renamed-away')],
      [join(home, '.pi', 'agent', 'skills', 'renamed-away'), join(ROOT, 'skills', 'renamed-away')],
      [join(home, '.pi', 'agent', 'extensions', 'gone.js'), join(ROOT, 'pi', 'extensions', 'gone.js')],
    ]
    for (const [link, target] of stale) symlinkSync(target, link)
    const output = install()
    for (const [link] of stale) {
      assert.equal(isLink(link), false, `${link} should be removed`)
      assert.match(output, new RegExp(`removed stale link ${link}`))
    }
  })
})

test('install.sh leaves links it does not own alone, dangling or not', () => {
  withHome((home, install) => {
    install()
    const elsewhere = join(home, 'third-party', 'skill')
    const dangling = join(home, '.claude', 'skills', 'third-party-dangling')
    symlinkSync(elsewhere, dangling)
    install()
    assert.equal(isLink(dangling), true)
    assert.equal(isLink(join(home, '.claude', 'skills', 'init-repo')), true)
    assert.equal(existsSync(join(home, '.claude', 'skills', 'init-repo', 'SKILL.md')), true)
  })
})

test('install.sh run a second time changes nothing and backs nothing up', () => {
  withHome((home, install) => {
    install()
    const output = install()
    assert.doesNotMatch(output, /linked|backed up|removed/)
  })
})
