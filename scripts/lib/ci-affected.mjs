/*
 * WHICH CI STEPS A PUSH CAN AFFECT — the owner's word, 2 November: "test only
 * what changed", because every push ran all of it, ~300 browser suites one
 * after another, three and a half hours for a change of one line.
 *
 * THE ANSWER IS READ FROM THE CODE, NOT FROM A LIST SOMEBODY KEEPS. A list of
 * "this folder belongs to those suites" is wrong the day after it is written,
 * and wrong in the direction that ships breakage: the import engine's code is
 * also imported by exports, the AI composer, the Slack and Basecamp importers,
 * sample data and the settings page, which no hand-drawn "imports" area would
 * have named. So:
 *
 *   1. each changed path is put in a class by `PATH_RULES` (prose, Verify's
 *      own tooling, a suite, the product's source, or "run everything");
 *   2. a changed source file is followed through EVERY file that imports it,
 *      directly or not (the reverse import graph of the API, the web app and
 *      the packages);
 *   3. what is affected is turned into what a suite can be seen to touch: an
 *      API module's routes (`/imports`), a page's address (`/settings`), and
 *      the element ids the web code draws (`dest-continue`, `grid-header-…`);
 *   4. a suite is selected when its own text, or a helper it imports, names
 *      any of them.
 *
 * IT FAILS OPEN, ALWAYS, and to the whole run. The schema, CI itself, the test
 * helpers, the toolchain, the app's shell (whatever every page draws), the
 * API's shared code (guards, permissions, the database module), a deleted
 * file, a catalogue line it cannot read, a controller with no path it can
 * name, and any path no rule knows: each runs everything. Selecting too much
 * costs minutes; selecting too little ships an untested change, and those are
 * not the same size of mistake (the `changes` job's own words).
 *
 * The made-sweep's mutation run (75 of a full run's ~215 minutes) is wanted
 * only when the sweep's own code changes; its cases run once on every run.
 *
 * Pure apart from reading the tree it is given, so `ci-affected-cases.mjs`
 * can plant trees and mutate this file.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'

/** The product's code: a change here is followed through its importers. */
export const SOURCE_ROOTS = ['apps/api/src', 'apps/web/src', 'packages/ui/src', 'packages/imports/src', 'packages/feature-flags/src']

const PACKAGE_DIRS = { '@rundesk/ui': 'packages/ui/src', '@rundesk/imports': 'packages/imports/src', '@rundesk/feature-flags': 'packages/feature-flags/src', '@rundesk/db': 'packages/db/src' }

/** What every page draws: reached by a change, and every page is. */
export const WEB_SHELL = ['apps/web/src/routes/__root.tsx', 'apps/web/src/routes/app.tsx', 'apps/web/src/routes/app.$workspaceId.tsx']
/** The web app's entry and its route table import every page, so they are no signal when reached (a change to them runs everything). */
const WEB_ROOTS = new Set(['apps/web/src/main.tsx', 'apps/web/src/routeTree.gen.ts'])

/** The API's shared code: every route goes through it. `app.module.ts` and `main.ts` import every module, so they are no signal when reached. */
const API_SHARED = /^apps\/api\/src\/common\//
const API_ROOTS = new Set(['apps/api/src/app.module.ts', 'apps/api/src/main.ts'])

/**
 * A changed path's class, first match wins; no match is `full`.
 *   none    no step tests it (prose; the rehearsal record)
 *   verify  Verify's own steps read it (the gates and their cases, deploy
 *           tooling and its tests, unit tests, lint and TS configs)
 *   suite   an e2e suite: that suite runs
 *   sweep   the made-sweep's self-test: its mutation run is wanted
 *   catalog the web's string catalogue: the components using each changed key
 *   source  the product's code: followed through its importers
 *   full    everything runs
 */
export const PATH_RULES = [
  [/^scripts\/(lib\/)?ci-affected/, 'full'],
  [/^scripts\/ci-rehearsal\//, 'verify'],
  [/^docs\//, 'none'],
  [/(^|\/)[^/]+\.md$/, 'none'],
  [/^test\/e2e\/breaks\//, 'verify'],
  [/^test\/e2e\/lib\/made(-sweep)?\.mjs$/, 'full+sweep'],
  [/^scripts\/check-made-sweep[^/]*\.mjs$/, 'sweep'],
  [/^test\/e2e\/lib\//, 'full'],
  [/^test\/e2e\/[^/]+\.mjs$/, 'suite'],
  [/^scripts\/e2e-lanes\/[^/]*stub[^/]*\.mjs$/, 'full'],
  [/^scripts\//, 'verify'],
  [/^test\/deploy\//, 'verify'],
  [/^deploy\//, 'verify'],
  [/^packages\/(eslint-config|typescript-config)\//, 'verify'],
  [/^(apps\/(api|web)|packages\/[^/]+)\/\.eslintrc[^/]*$/, 'verify'],
  [/\.(test|spec)\.(ts|tsx|mts|mjs)$/, 'verify'],
  [/^apps\/api\/src\/(main\.ts|app\.module\.ts)$/, 'full'],
  [API_SHARED, 'full'],
  [/^apps\/web\/src\/(main\.tsx|routeTree\.gen\.ts)$/, 'full'],
  [/^apps\/web\/src\/lib\/i18n\/catalogs\.ts$/, 'catalog'],
  [/^(apps\/api\/src|apps\/web\/src|packages\/(ui|imports|feature-flags)\/src)\//, 'source'],
]

export function classOf(path) {
  for (const [re, cls] of PATH_RULES) if (re.test(path)) return cls
  return 'full'
}

const CODE_EXT = /\.(ts|tsx|mts|mjs|js)$/

function walk(root, dir, out) {
  let entries
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) walk(root, rel, out)
    // Unit tests are Verify's, not the product's: what they import is no route or page.
    else if (CODE_EXT.test(e.name) && !/\.(test|spec)\.(ts|tsx|mts|mjs)$/.test(e.name)) out.push(rel)
  }
}

const IMPORT_RES = [
  /(?:^|[\s;}])(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"\n]+)['"]/gm,
  /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g,
]

function resolveSpec(root, from, spec, files) {
  let base
  if (spec.startsWith('./') || spec.startsWith('../')) base = join(dirname(from), spec).split(sep).join('/')
  else if (spec.startsWith('@/') && from.startsWith('apps/web/src/')) base = `apps/web/src/${spec.slice(2)}`
  else {
    const pkg = Object.keys(PACKAGE_DIRS).find((p) => spec === p || spec.startsWith(`${p}/`))
    if (!pkg) return null
    base = spec === pkg ? `${PACKAGE_DIRS[pkg]}/index` : `${PACKAGE_DIRS[pkg]}/${spec.slice(pkg.length + 1)}`
  }
  const stem = base.replace(/\.(js|mjs)$/, '')
  for (const c of [base, `${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, `${stem}.mjs`, `${stem}.js`, `${stem}/index.ts`, `${stem}/index.tsx`]) {
    if (files.has(c)) return c
  }
  return null
}

/** Every source file, and who imports whom, read from the tree at `root`. */
export function importGraph(root) {
  const list = []
  for (const r of SOURCE_ROOTS) walk(root, r, list)
  const files = new Set(list)
  const importers = new Map()
  const text = new Map()
  for (const f of list) {
    const src = readFileSync(join(root, f), 'utf8')
    text.set(f, src)
    for (const re of IMPORT_RES) {
      re.lastIndex = 0
      for (const m of src.matchAll(re)) {
        const target = resolveSpec(root, f, m[1], files)
        if (!target || target === f) continue
        if (!importers.has(target)) importers.set(target, new Set())
        importers.get(target).add(f)
      }
    }
  }
  return { files, importers, text }
}

/** The changed files and everything that imports them, however indirectly. */
export function dependents(graph, seeds) {
  const seen = new Set(seeds)
  const queue = [...seeds]
  while (queue.length) {
    const f = queue.pop()
    for (const by of graph.importers.get(f) ?? []) {
      if (!seen.has(by)) {
        seen.add(by)
        queue.push(by)
      }
    }
  }
  return seen
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const statics = (path) => path.split('/').filter((seg) => seg && !seg.startsWith(':') && seg !== 'workspaces' && seg !== '*')

/**
 * The words of a controller's routes a suite could name: its base path's
 * static segments but `workspaces` (`workspaces/:id/imports` → `imports`).
 * A controller mounted at the root is named by the first static segment of
 * each method's path instead (`auth/login` → `auth`) — the method words of a
 * mounted one (`start`, `file`) would name half the suites for nothing.
 */
export function controllerKeywords(src) {
  const base = /@Controller\(\s*(?:['"`]([^'"`]*)['"`]|\{[^}]*?path:\s*['"`]([^'"`]*)['"`])/.exec(src)
  const words = new Set(statics(base ? (base[1] ?? base[2] ?? '') : ''))
  if (words.size) return words
  for (const m of src.matchAll(/@(?:Get|Post|Put|Patch|Delete|All|Options|Head)\(\s*['"`]([^'"`]*)['"`]/g)) {
    const [first] = statics(m[1])
    if (first) words.add(first)
  }
  return words
}

/** The directory of the Nest module an API file belongs to (the nearest with a `*.module.ts`), or null. */
function moduleDir(root, file) {
  let dir = dirname(file)
  while (dir.startsWith('apps/api/src/modules/')) {
    let names = []
    try {
      names = readdirSync(join(root, dir))
    } catch {
      /* gone */
    }
    if (names.some((n) => n.endsWith('.module.ts'))) return dir
    dir = dirname(dir)
  }
  return null
}

/** A page's address words from its route file: `app.$workspaceId.settings.lazy.tsx` → `settings`. */
export function routeKeywords(file) {
  const name = file.split('/').pop().replace(/\.tsx?$/, '').replace(/\.lazy$/, '')
  return name
    .split('.')
    .filter((s) => s && s !== 'app' && s !== 'index' && !s.startsWith('$') && !s.startsWith('_') && !s.startsWith('('))
}

/** The element ids a web file draws: `data-testid` and `testId` values, a template's literal head as a prefix (`grid-header-`). */
export function testIdsIn(src) {
  const ids = new Set()
  for (const m of src.matchAll(/(?:data-testid|testId|testid)\s*(?:=|:)\s*\{?\s*(['"`])([A-Za-z0-9_.:-]*)(\$\{)?/g)) {
    const id = m[2]
    if (!id) continue
    ids.add(m[3] ? `${id}…` : id)
  }
  return ids
}

/**
 * Does web code call one of these API routes? A path starting `/workspaces/`
 * that names one, the path an `api(…)` or `downloadFile(…)` call is given, or
 * one a `…Url(…)` helper or a `const …path / url / base =` is built from. Not
 * any string naming the word: the sidebar's `path: '/goals'` is a link to the
 * Goals page, and reading it as a call would make every goals change look
 * like a change to what every page draws.
 */
export function callsRoute(src, words) {
  for (const w of words) {
    const word = `/${esc(w)}(?=[/?'"\`$\\s)#,]|$)`
    const res = [
      new RegExp(`['"\`]/workspaces/[^'"\`\\n]*?${word}`),
      new RegExp(`\\b(?:api|downloadFile|downloadFilePost)\\s*(?:<[^>()]*>)?\\(\\s*['"\`]${word}`),
      new RegExp(`\\b\\w*(?:Url|URL|url)\\s*\\(\\s*['"\`]${word}`),
      new RegExp(`\\b(?:const|let)\\s+\\w*(?:[pP]ath|[uU]rl|URL|[bB]ase)\\w*\\s*=\\s*(?:\\([^)]*\\)\\s*=>\\s*)?['"\`]${word}`),
    ]
    if (res.some((re) => re.test(src))) return true
  }
  return false
}

/** What a suite's text names: every whole string literal, and every template's literal head (`map-select-…`). */
function suiteTokens(src) {
  const exact = new Set()
  const heads = new Set()
  for (const m of src.matchAll(/(['"`])([A-Za-z0-9_.:-]+)\1/g)) exact.add(m[2])
  for (const m of src.matchAll(/[`'"\s=[(]([A-Za-z0-9_.:-]+-)\$\{/g)) heads.add(m[1])
  return { exact, heads }
}

function idMatches(id, tokens) {
  if (id.endsWith('…')) {
    const head = id.slice(0, -1)
    for (const t of tokens.exact) if (t.startsWith(head)) return true
    for (const h of tokens.heads) if (h.startsWith(head) || head.startsWith(h)) return true
    return false
  }
  if (tokens.exact.has(id)) return true
  for (const h of tokens.heads) if (id.startsWith(h)) return true
  return false
}

/** Each suite's text with the helpers it imports from `test/e2e/lib`, however deep. */
export function suiteTexts(root, names) {
  const libText = new Map()
  const readLib = (rel, seen) => {
    if (seen.has(rel)) return ''
    seen.add(rel)
    const path = join(root, rel)
    if (!existsSync(path)) return ''
    const src = readFileSync(path, 'utf8')
    let out = src
    for (const m of src.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const next = join(dirname(rel), m[1]).split(sep).join('/')
      if (next.startsWith('test/e2e/lib/')) out += `\n${libText.get(next) ?? readLib(next, seen)}`
    }
    return out
  }
  const out = new Map()
  for (const name of names) {
    const rel = `test/e2e/${name}.mjs`
    out.set(name, existsSync(join(root, rel)) ? readLib(rel, new Set()) : '')
  }
  return out
}

/**
 * The keys a diff of the catalogue changed, or null when a changed line is not
 * a `'key': '…'` line (then nothing narrower can be said).
 */
export function changedCatalogKeys(diff) {
  const keys = new Set()
  for (const line of diff.split('\n')) {
    if (!/^[+-]/.test(line) || /^(\+\+\+|---)\s/.test(line)) continue
    const body = line.slice(1)
    if (!body.trim()) continue
    const m = /^\s*'([A-Za-z0-9_.-]+)'\s*:/.exec(body)
    if (!m) return null
    keys.add(m[1])
  }
  return keys
}

/** The web and UI files that use a catalogue key, by its literal or a template's dotted head (`ie.app.${…}`). */
function keyUsers(graph, key) {
  const users = []
  const literal = new RegExp(`['"\`]${esc(key)}['"\`]`)
  for (const [f, src] of graph.text) {
    if (!/^(apps\/web\/src|packages\/ui\/src)\//.test(f) || f.endsWith('catalogs.ts')) continue
    if (literal.test(src)) users.push(f)
  }
  if (users.length) return users
  const parts = key.split('.')
  for (let n = parts.length - 1; n >= 1; n -= 1) {
    const head = new RegExp(`\`${esc(parts.slice(0, n).join('.'))}\\.\\$\\{`)
    for (const [f, src] of graph.text) {
      if (/^(apps\/web\/src|packages\/ui\/src)\//.test(f) && head.test(src)) users.push(f)
    }
    if (users.length) return users
  }
  return users
}

/**
 * What to run for these changed paths.
 *   changes: [{ path, status }]  status as `git diff --name-status` gives it (A, M, D, …)
 *   catalogDiff: the `git diff -U0` text of the catalogue, when it changed
 *   suites: { harness: string[], browser: string[] } — the suites each job registers
 */
export function affected({ root, changes, catalogDiff = '', suites }) {
  const reasons = []
  const out = { code: false, full: false, suites: [], web: false, harness: false, sweepMutate: false, reasons }
  const full = (why) => {
    if (!out.full) reasons.push(`everything: ${why}`)
    out.full = true
  }
  if (!changes.length) {
    full('the push changed no file that could be read, so nothing narrower can be said')
    out.code = true
  }
  const seeds = new Set()
  const picked = new Set()
  let graph = null
  const graphOf = () => (graph ??= importGraph(root))

  for (const { path, status } of changes) {
    const cls = classOf(path)
    if (cls !== 'none') out.code = true
    if (cls === 'none' || cls === 'verify') continue
    if (cls === 'full') {
      full(`${path} is shared by everything, or no rule knows it`)
      continue
    }
    if (cls === 'full+sweep') {
      full(`${path} is the test cleanup every suite uses`)
      out.sweepMutate = true
      continue
    }
    if (cls === 'sweep') {
      out.sweepMutate = true
      out.harness = true
      reasons.push(`the made-sweep's mutation run: ${path} changed`)
      continue
    }
    if (cls === 'suite') {
      const name = path.slice('test/e2e/'.length, -'.mjs'.length)
      if (status?.startsWith('D')) continue
      picked.add(name)
      reasons.push(`${name}: its own file changed`)
      continue
    }
    if (status?.startsWith('D')) {
      full(`${path} was deleted, and what imported it cannot be followed`)
      continue
    }
    if (cls === 'catalog') {
      const keys = changedCatalogKeys(catalogDiff)
      if (!keys || !keys.size) {
        full(`${path} changed in a line that is not one key`)
        continue
      }
      for (const key of keys) {
        const users = keyUsers(graphOf(), key)
        if (!users.length) {
          full(`the catalogue key ${key} is used by no file that can be found`)
          break
        }
        for (const u of users) seeds.add(u)
      }
      continue
    }
    seeds.add(path)
  }

  if (!out.full && seeds.size) {
    const g = graphOf()
    for (const s of seeds) if (!g.files.has(s)) full(`${s} is not in the import graph`)
    const reach = dependents(g, [...seeds].filter((s) => g.files.has(s)))
    const shell = WEB_SHELL.find((f) => reach.has(f))
    if (shell) full(`${shell} draws every page, and the change reaches it`)
    const shared = [...reach].find((f) => API_SHARED.test(f))
    if (shared) full(`${shared} is on every API route, and the change reaches it`)
    if (!out.full) {
      const apiWords = new Set()
      const pageWords = new Set()
      const ids = new Set()
      const modules = new Set()
      for (const f of reach) {
        if (f.startsWith('apps/api/src/')) {
          if (API_ROOTS.has(f)) continue
          const dir = moduleDir(root, f)
          if (!dir) {
            full(`${f} is in no API module whose routes can be named`)
            break
          }
          modules.add(dir)
        } else if (/^(apps\/web\/src|packages\/ui\/src)\//.test(f)) {
          out.web = true
          if (WEB_ROOTS.has(f)) continue
          if (/^apps\/web\/src\/routes\//.test(f)) for (const w of routeKeywords(f)) pageWords.add(w)
          for (const id of testIdsIn(g.text.get(f) ?? '')) ids.add(id)
        }
      }
      for (const dir of modules) {
        if (out.full) break
        const controllers = [...g.files].filter((f) => f.startsWith(`${dir}/`) && f.endsWith('.controller.ts'))
        for (const c of controllers) {
          const words = controllerKeywords(g.text.get(c) ?? '')
          if (!words.size) {
            full(`${c} has no route a suite could be seen to name`)
            break
          }
          for (const w of words) apiWords.add(w)
        }
      }
      // An API change reaches the components that call it — the web files naming
      // one of its routes, and whatever draws them — by the elements they draw.
      // Not by their pages' addresses: the page's code did not change, so it
      // still loads, and what can differ is what those components show (a
      // change to the import runner is no reason to run every Settings suite).
      if (!out.full && apiWords.size) {
        const callers = [...g.text].filter(([f, src]) => /^(apps\/web\/src|packages\/ui\/src)\//.test(f) && callsRoute(src, apiWords)).map(([f]) => f)
        const webReach = dependents(g, callers)
        const webShell = WEB_SHELL.find((f) => webReach.has(f))
        if (webShell) full(`the API change is called from ${webShell}, which draws every page`)
        for (const f of webReach) {
          if (!/^(apps\/web\/src|packages\/ui\/src)\//.test(f) || WEB_ROOTS.has(f)) continue
          out.web = true
          for (const id of testIdsIn(g.text.get(f) ?? '')) ids.add(id)
        }
      }
      if (!out.full) {
        const texts = suiteTexts(root, suites.harness)
        const apiRes = [...apiWords].map((w) => new RegExp(`/${esc(w)}(?=[/?'"\`$\\s)#,]|$)`))
        const pageRes = [...pageWords].map((w) => new RegExp(`/${esc(w)}(?=[/?'"\`$\\s)#,]|$)`))
        for (const [name, src] of texts) {
          const tokens = suiteTokens(src)
          const api = apiRes.find((re) => re.test(src))
          const page = pageRes.find((re) => re.test(src))
          const id = [...ids].find((i) => idMatches(i, tokens))
          if (api || page || id) {
            picked.add(name)
            reasons.push(`${name}: names ${api ? `the route ${api.source.split('(?=')[0].replace(/\\/g, '')}` : page ? `the page ${page.source.split('(?=')[0].replace(/\\/g, '')}` : `the element ${id}`}`)
          }
        }
      }
    }
  }

  if (out.full) {
    out.web = true
    out.harness = true
    out.suites = []
    return out
  }
  const browser = new Set(suites.browser)
  for (const p of picked) if (browser.has(p)) out.web = true
  out.suites = [...picked].filter((p) => suites.harness.includes(p)).sort()
  if (out.suites.length) out.harness = true
  return out
}
