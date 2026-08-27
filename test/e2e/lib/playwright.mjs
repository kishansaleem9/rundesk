/**
 * Finding playwright, once, for every suite that needs a browser.
 *
 * Four suites imported it as a bare specifier — `import { chromium } from
 * 'playwright'` — which only resolves when playwright sits in the repo's own
 * `node_modules`. Three others carried a private copy of the search below.
 * That split is why `ui-sweep`, `video-regression`, `a39-dm-tabs` and
 * `a61-meeting-record` could not be run at all outside a full install, while
 * the suite sitting next to them ran fine: not a difference in what they test,
 * just a difference in how they look for a package.
 *
 * NODE_PATH does not help here — it has no effect on ESM bare-specifier
 * resolution — which is exactly the sort of thing worth knowing in one place
 * rather than rediscovering per suite.
 *
 * Exits 2 rather than throwing a module-not-found stack, because a suite that
 * cannot find a browser has run no checks, and the distinction between "no
 * failures" and "nothing ran" is the whole point of these files.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.resolve(import.meta.dirname, '../../..')
const require_ = createRequire(path.join(REPO, 'noop.cjs'))

/** Where a browser may have been installed, in the order worth trying. */
export const PW_DIRS = [
  process.env.PLAYWRIGHT_DIR,
  '/opt/rundesk-pw/node_modules',
  `${process.env.HOME ?? '/root'}/.rundesk-pw/node_modules`,
  '/usr/lib/node_modules',
  '/opt/node22/lib/node_modules',
].filter(Boolean)

/**
 * The chromium launcher, from wherever playwright actually is.
 *
 * @param {{ exitIfMissing?: boolean }} [opts] — pass `exitIfMissing: false` to
 *   get `null` back instead of ending the process, for a caller that means to
 *   report the absence itself.
 */
export async function resolveChromium({ exitIfMissing = true } = {}) {
  let chromium

  // The ordinary case: it is installed where node would look anyway.
  for (const id of ['playwright', '@playwright/test', 'playwright-core']) {
    try {
      ;({ chromium } = require_(id))
    } catch {
      /* next */
    }
    if (chromium) break
  }

  // Otherwise, the places this project is known to put it.
  if (!chromium) {
    for (const dir of PW_DIRS) {
      for (const entry of ['playwright/index.mjs', 'playwright/index.js']) {
        const file = `${dir}/${entry}`
        if (!fs.existsSync(file)) continue
        try {
          ;({ chromium } = await import(pathToFileURL(file).href))
        } catch {
          /* try the next */
        }
        if (chromium) break
      }
      if (chromium) break
    }
  }

  if (!chromium && exitIfMissing) {
    console.error(
      '\x1b[31m✗ playwright is not installed anywhere this script can see.\x1b[0m\n' +
        `  Searched: ${PW_DIRS.join(', ')}\n` +
        '  Exiting 2 rather than reporting checks nobody ran.',
    )
    process.exit(2)
  }
  return chromium ?? null
}

/** The browser binary these suites launch, overridable by env. */
export const CHROME =
  process.env.CHROME ||
  process.env.CHROMIUM_PATH ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

/**
 * Launch options that work on a developer's machine AND on a CI runner.
 *
 * The default above is one particular sandbox's unpacked Chromium. Passing it
 * as `executablePath` unconditionally is what broke all four of these suites
 * the first time they ran in CI: playwright installs its own browser there, at
 * a path with a different build number, and a hardcoded one fails with
 * "executable doesn't exist" before a single check runs.
 *
 * So it is offered, not insisted on — present it only when it is really there,
 * and otherwise say nothing and let playwright use the browser it installed.
 */
export function launchOptions(extraArgs = []) {
  return {
    ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...extraArgs],
  }
}
