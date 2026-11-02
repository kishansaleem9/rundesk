#!/usr/bin/env node
/*
 * WHICH SUITES A PUSH RUNS, ON PLANTED TREES (`scripts/lib/ci-affected.mjs`,
 * `scripts/ci-affected.mjs`).
 *
 * A selection that runs too little is the costly mistake — it ships what no
 * suite looked at — so most cases here are about what MUST be selected:
 * through an importer two modules away, through the web page that calls a
 * changed API, through a package's barrel, through a catalogue key's users;
 * and what must run everything: the app's shell, the API's shared code, a
 * deleted file, a controller with no nameable route, a catalogue line that is
 * not a key, any path no rule knows. The rest pin the narrowing: a sidebar
 * LINK to a page is no call of its API, an API change brings in the elements
 * that show it and not the whole page, and prose runs nothing.
 *
 * Then the record a local rehearsal leaves, and when CI may trust it; the
 * command end to end on a planted git repository; and two reads of the real
 * tree: every Postgres-harness suite step in ci.yml is gated on its own name
 * (a wrong name would never run), and a change to the import engine selects
 * the suites that import a ClickUp export.
 *
 * `--mutate` breaks the selection and the trust one rule at a time.
 *
 *   node scripts/ci-affected-cases.mjs [--mutate]
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync, execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { proveMutationsBite } from './lib/mutate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const LIB = process.env.CI_AFFECTED_LIB_UNDER_TEST ?? join(HERE, 'lib', 'ci-affected.mjs')
const CLI = process.env.CI_AFFECTED_CLI_UNDER_TEST ?? join(HERE, 'ci-affected.mjs')
const { affected } = await import(pathToFileURL(LIB).href)
const { trust, jobSuites } = await import(pathToFileURL(CLI).href)

let pass = 0
let fail = 0
const chk = (cond, good, bad) => {
  if (cond) { pass += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { fail += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad ? ` — ${bad}` : ''}`) }
}

/** A small product: two API modules (notes depends on tags), a shell, two pages, a package, a catalogue, six suites. */
const TREE = {
  'apps/api/src/main.ts': "import { AppModule } from './app.module'\n",
  'apps/api/src/app.module.ts': "import { NotesModule } from './modules/notes/notes.module'\nimport { TagsModule } from './modules/tags/tags.module'\nimport { BlankModule } from './modules/blank/blank.module'\nimport { ReportsModule } from './modules/reports/reports.module'\n",
  'apps/api/src/common/guards/auth.guard.ts': "import { AuditService } from '../../modules/audit/audit.service'\n",
  'apps/api/src/modules/audit/audit.module.ts': "import { AuditService } from './audit.service'\n",
  'apps/api/src/modules/audit/audit.service.ts': 'export class AuditService {}\n',
  'apps/api/src/modules/notes/notes.module.ts': "import { NotesController } from './notes.controller'\n",
  'apps/api/src/modules/notes/notes.controller.ts': "import { NotesService } from './notes.service'\n@Controller('workspaces/:workspaceId/notes')\nexport class NotesController {\n  @Post(':id/start') start() {}\n}\n",
  'apps/api/src/modules/notes/notes.service.ts': "import { TagsService } from '../tags/tags.service'\nexport class NotesService {}\n",
  'apps/api/src/modules/tags/tags.module.ts': "import { TagsController } from './tags.controller'\n",
  'apps/api/src/modules/tags/tags.controller.ts': "import { TagsService } from './tags.service'\n@Controller('tags')\nexport class TagsController {}\n",
  'apps/api/src/modules/tags/tags.service.ts': 'export class TagsService {}\n',
  'apps/api/src/modules/blank/blank.module.ts': "import { BlankController } from './blank.controller'\n",
  'apps/api/src/modules/blank/blank.controller.ts': "import { BlankService } from './blank.service'\n@Controller()\nexport class BlankController {\n  @Get(':id') one() {}\n}\n",
  'apps/api/src/modules/blank/blank.service.ts': 'export class BlankService {}\n',
  'apps/api/src/modules/reports/reports.module.ts': "import { ReportsController } from './reports.controller'\n",
  'apps/api/src/modules/reports/reports.controller.ts': "import { ReportsService } from './reports.service'\n@Controller('workspaces/:workspaceId/reports')\nexport class ReportsController {}\n",
  'apps/api/src/modules/reports/reports.service.ts': 'export class ReportsService {}\n',
  'apps/web/src/main.tsx': "import { routeTree } from './routeTree.gen'\n",
  'apps/web/src/routeTree.gen.ts': "import './routes/__root'\nimport './routes/app.$workspaceId'\nimport './routes/app.$workspaceId.notes.lazy'\nimport './routes/app.$workspaceId.tags.lazy'\nimport './routes/app.$workspaceId.settings.lazy'\n",
  'apps/web/src/routes/app.$workspaceId.settings.lazy.tsx': "import { SettingsPage } from '../pages/settings-page'\n",
  'apps/web/src/pages/settings-page.tsx': "import { NotesTab } from '../components/notes-tab'\nexport const SettingsPage = () => <main data-testid=\"settings-page\" />\n",
  'apps/web/src/components/notes-tab.tsx': "import { listNotes } from '../lib/notes-api'\nexport const NotesTab = () => <section data-testid=\"notes-tab\" />\n",
  'apps/web/src/routes/__root.tsx': "import { Toaster } from '../components/toaster'\n",
  'apps/web/src/routes/app.$workspaceId.tsx': "import { Sidebar } from '../components/sidebar'\n",
  'apps/web/src/routes/app.$workspaceId.notes.lazy.tsx': "import { NotesPage } from '../pages/notes-page'\n",
  'apps/web/src/routes/app.$workspaceId.tags.lazy.tsx': "import { TagsPage } from '../pages/tags-page'\n",
  'apps/web/src/components/toaster.tsx': 'export const Toaster = () => null\n',
  'apps/web/src/components/sidebar.tsx': "const NAV = [{ id: 'notes', path: '/notes' }, { id: 'tags', path: '/tags' }]\nexport const Sidebar = () => <nav data-testid=\"sidebar-nav\" />\n",
  'apps/web/src/components/note-card.tsx': 'export const NoteCard = ({ id }) => <div data-testid={`note-card-${id}`} />\n',
  'apps/web/src/pages/notes-page.tsx': "import { NoteCard } from '../components/note-card'\nimport { listNotes } from '../lib/notes-api'\nexport const NotesPage = () => <main data-testid=\"notes-page\">{t(`notes.kind.${kind}`)}</main>\n",
  'apps/web/src/pages/tags-page.tsx': "export const TagsPage = () => <main data-testid=\"tags-page\">{t('tags.title')}</main>\n",
  'apps/web/src/lib/notes-api.ts': "import { CHUNK } from '@rundesk/imports'\nexport const listNotes = (ws) => api(`/workspaces/${ws}/notes`)\n",
  'apps/web/src/lib/i18n/catalogs.ts': "export const en = {\n  'tags.title': 'Tags',\n  'notes.kind.big': 'Big',\n}\n",
  'packages/imports/src/index.ts': "export * from './grid'\n",
  'packages/imports/src/grid.ts': 'export const CHUNK = 500\n',
  'test/e2e/lib/fixture.mjs': "export const login = (b) => fetch(`${b}/auth/login`)\n",
  'test/e2e/lib/made.mjs': 'export const madeAccount = () => {}\n',
  'test/e2e/notes-api.mjs': "import { login } from './lib/fixture.mjs'\nawait api(`/workspaces/${ws}/notes`)\n",
  'test/e2e/notes-ui.mjs': "await page.getByTestId('notes-page').waitFor()\n",
  'test/e2e/settings-visit.mjs': 'await page.goto(`${B}/app/${ws}/settings?tab=members`)\n',
  'test/e2e/notes-visit.mjs': 'await page.goto(`${B}/app/${ws}/notes`)\n',
  'test/e2e/tags.mjs': "await api(`/tags/${id}`)\nawait page.getByTestId('tags-page').waitFor()\n",
  'test/e2e/sidebar.mjs': "await page.getByTestId('sidebar-nav').waitFor()\n",
  'test/e2e/unrelated.mjs': 'await page.goto(`${B}/app/${ws}/calendar`)\n',
  'test/e2e/no-dead-ends.mjs': 'await page.goto(B)\n',
}
const SUITES = { harness: ['notes-api', 'notes-ui', 'notes-visit', 'settings-visit', 'tags', 'sidebar', 'unrelated'], browser: ['no-dead-ends'] }

function plant(files) {
  const dir = mkdtempSync(join(tmpdir(), 'ci-affected-'))
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    writeFileSync(join(dir, p), body)
  }
  return dir
}

const TREE_DIR = plant(TREE)
const run = (paths, { status = 'M', catalogDiff = '' } = {}) =>
  affected({ root: TREE_DIR, changes: paths.map((path) => ({ path, status })), catalogDiff, suites: SUITES })
const picked = (r) => r.suites.join(',')

try {
  console.log('\n▶ what is not the product runs nothing heavy')
  {
    const r = run(['docs/notes.md', 'README.md'])
    chk(!r.code && !r.full && !r.harness && !r.web, 'prose alone runs no heavy job', JSON.stringify(r))
  }
  {
    const r = run(['test/e2e/breaks/nt-1-a-patch.py', 'scripts/check-something.mjs', 'test/deploy/x.test.sh'])
    chk(r.code && !r.full && !r.harness && !r.web, 'a break patch, a gate and a deploy test are Verify’s alone', JSON.stringify(r))
  }
  {
    const r = run(['test/e2e/tags.mjs'])
    chk(picked(r) === 'tags' && !r.web && !r.full, 'a suite’s own file runs that suite', JSON.stringify(r))
    const b = run(['test/e2e/no-dead-ends.mjs'])
    chk(b.web && !b.harness && !b.full, 'a browser suite’s own file runs the browser suites and no harness', JSON.stringify(b))
  }

  console.log('\n▶ what a change reaches, through every importer')
  {
    const r = run(['apps/api/src/modules/notes/notes.service.ts'])
    chk(picked(r) === 'notes-api,notes-ui,notes-visit' && r.web && !r.full,
      'an API change runs the suites naming its route or a page of its name, and the ones touching what calls it — not every visitor of a page that hosts the caller, nor everything for a sidebar link',
      picked(r) || JSON.stringify(r.reasons))
    const s = run(['apps/web/src/pages/settings-page.tsx'])
    chk(picked(s) === 'settings-visit' && !s.full, 'while a change to that host page runs its every visitor', picked(s) || JSON.stringify(s.reasons))
  }
  {
    const r = run(['apps/api/src/modules/tags/tags.service.ts'])
    chk(picked(r) === 'notes-api,notes-ui,notes-visit,tags' && !r.full, 'a module another imports reaches that one’s routes too', picked(r) || JSON.stringify(r.reasons))
  }
  {
    const r = run(['apps/web/src/components/note-card.tsx'])
    chk(picked(r) === 'notes-api,notes-ui,notes-visit' && r.web && !r.full,
      'a web change runs the suites using its elements and every one visiting its page', picked(r) || JSON.stringify(r.reasons))
  }
  {
    const r = run(['packages/imports/src/grid.ts'])
    chk(picked(r).includes('notes-ui') && picked(r).includes('notes-visit') && !r.full, 'a package file reaches its importers through the package’s barrel', picked(r) || JSON.stringify(r.reasons))
  }
  {
    const r = run(['apps/api/src/modules/reports/reports.service.ts'])
    chk(r.code && !r.full && !r.harness && !r.web, 'an API module nothing tests, and nothing on the web calls, runs no heavy job', JSON.stringify(r))
  }

  console.log('\n▶ what runs everything')
  {
    const r = run(['apps/web/src/components/sidebar.tsx'])
    chk(r.full && /draws every page/.test(r.reasons.join(' ')), 'a change the app’s shell draws runs everything', JSON.stringify(r.reasons))
  }
  {
    const r = run(['apps/api/src/modules/audit/audit.service.ts'])
    chk(r.full && /every API route/.test(r.reasons.join(' ')), 'a change the API’s shared code reaches runs everything', JSON.stringify(r.reasons))
    const c = run(['apps/api/src/common/guards/auth.guard.ts'])
    chk(c.full, 'and so does a change to that shared code itself', JSON.stringify(c.reasons))
  }
  {
    const r = run(['apps/api/src/modules/blank/blank.service.ts'])
    chk(r.full && /no route/.test(r.reasons.join(' ')), 'a module whose routes cannot be named runs everything', JSON.stringify(r.reasons))
  }
  {
    const r = run(['apps/web/src/components/note-card.tsx'], { status: 'D' })
    chk(r.full, 'a deleted source file runs everything', JSON.stringify(r.reasons))
  }
  for (const p of ['packages/db/src/schema/tasks.ts', '.github/workflows/ci.yml', 'test/e2e/lib/fixture.mjs', 'pnpm-lock.yaml', 'weird/new-thing.txt', 'scripts/lib/ci-affected.mjs']) {
    const r = run([p])
    chk(r.full && r.harness && r.web, `${p} runs everything`, JSON.stringify(r))
  }

  console.log('\n▶ the catalogue, by the keys that changed')
  {
    const diff = "@@ -2 +2 @@\n-  'tags.title': 'Tags',\n+  'tags.title': 'Labels',\n"
    const r = run(['apps/web/src/lib/i18n/catalogs.ts'], { catalogDiff: diff })
    chk(picked(r) === 'tags' && !r.full, 'a key’s new words run the suites of the components using it', picked(r) || JSON.stringify(r.reasons))
  }
  {
    const diff = "@@ -3 +3 @@\n-  'notes.kind.big': 'Big',\n+  'notes.kind.big': 'Large',\n"
    const r = run(['apps/web/src/lib/i18n/catalogs.ts'], { catalogDiff: diff })
    chk(picked(r).includes('notes-visit') && !r.full, 'a key reached through a template’s head (`notes.kind.${…}`) finds its users', picked(r) || JSON.stringify(r.reasons))
  }
  {
    const r = run(['apps/web/src/lib/i18n/catalogs.ts'], { catalogDiff: "@@ -1,2 +1,2 @@\n-export const en = {\n+export const en: Catalog = {\n-  'tags.title': 'Tags',\n+  'tags.title': 'Labels',\n" })
    chk(r.full, 'a catalogue line that is not one key runs everything, though a key changed beside it', JSON.stringify(r.reasons))
    const g = run(['apps/web/src/lib/i18n/catalogs.ts'], { catalogDiff: "@@ -9 +9 @@\n+  'gone.key': 'Nobody',\n" })
    chk(g.full, 'a key no file can be found using runs everything', JSON.stringify(g.reasons))
  }

  console.log('\n▶ the made-sweep’s mutations')
  {
    const r = run(['scripts/check-made-sweep.mjs'])
    chk(r.sweepMutate && r.harness && !r.full && !r.suites.length, 'its own gate changing wants its mutation run, and nothing else', JSON.stringify(r))
    const m = run(['test/e2e/lib/made.mjs'])
    chk(m.sweepMutate && m.full, 'the cleanup every suite uses changing wants it, and everything', JSON.stringify(m))
    const n = run(['apps/web/src/components/note-card.tsx'])
    chk(!n.sweepMutate, 'and nothing else wants it', JSON.stringify(n))
  }

  console.log('\n▶ a local rehearsal, and when CI may trust it')
  {
    const record = { result: 'passed', commit: 'c0ffee00', at: '2026-11-02', verify: 'all', selection: { full: false, suites: ['notes-api', 'notes-ui'], web: true, harness: true, sweepMutate: false } }
    const needed = { full: false, suites: ['notes-api'], web: true, harness: true, sweepMutate: false }
    const ok = { isAncestor: () => true, changedSince: () => ['docs/rehearsals/latest.json', 'docs/open-work.md'] }
    chk(trust(record, needed, ok).trusted, 'a passing rehearsal of an ancestor, with prose since, that ran what the push needs is trusted', trust(record, needed, ok).why)
    const cases = [
      ['no record', null, needed, ok],
      ['a rehearsal that failed', { ...record, result: 'failed' }, needed, ok],
      ['code changed after it', record, needed, { ...ok, changedSince: () => ['apps/web/src/components/note-card.tsx'] }],
      ['a commit outside the push’s history', record, needed, { ...ok, isAncestor: () => false }],
      ['part of Verify only', { ...record, verify: 'quick' }, needed, ok],
      ['a selection, where the push needs everything', record, { ...needed, full: true }, ok],
      ['a suite the push needs that it did not run', record, { ...needed, suites: ['notes-api', 'tags'] }, ok],
      ['no browser suites, where the push wants them', { ...record, selection: { ...record.selection, web: false } }, needed, ok],
      ['no sweep mutations, where the push wants them', record, { ...needed, sweepMutate: true }, ok],
    ]
    for (const [what, rec, need, io] of cases) {
      const v = trust(rec, need, io)
      chk(!v.trusted, `not trusted: ${what}`, v.why)
    }
    const full = { ...record, selection: { full: true, suites: [], web: true, harness: true, sweepMutate: false } }
    chk(trust(full, { ...needed, full: true }, ok).trusted, 'a full rehearsal covers a push that needs everything', trust(full, { ...needed, full: true }, ok).why)
  }

  console.log('\n▶ the command, on a planted repository')
  {
    const repo = plant({
      ...TREE,
      '.github/workflows/ci.yml': [
        'jobs:',
        '  browser-suites:',
        '    steps:',
        '      - run: node test/e2e/no-dead-ends.mjs',
        '  postgres-harnesses:',
        '    steps:',
        ...SUITES.harness.map((s) => `      - run: node test/e2e/${s}.mjs --api 3011`),
        '',
      ].join('\n'),
    })
    const g = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    g('init', '-q')
    g('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '-A')
    g('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'base')
    const A = g('rev-parse', 'HEAD')
    writeFileSync(join(repo, 'apps/api/src/modules/notes/notes.service.ts'), "import { TagsService } from '../tags/tags.service'\nexport class NotesService { n = 1 }\n")
    g('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qam', 'code')
    const B = g('rev-parse', 'HEAD')
    const cli = (...args) => {
      const r = spawnSync(process.execPath, [CLI, ...args, '--json'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CI_AFFECTED_ROOT: repo } })
      try {
        return JSON.parse(r.stdout.trim().split('\n').pop())
      } catch {
        return { error: r.stderr || r.stdout }
      }
    }
    const sync = cli('--event', 'pull_request', '--action', 'synchronize', '--base', A, '--head', B)
    chk(sync.suites?.join(',') === 'notes-api,notes-ui,notes-visit' && !sync.full && !sync.trusted, 'a push of one service runs its suites, untrusted with no record', JSON.stringify(sync))
    const pushed = cli('--event', 'push', '--base', A, '--head', B)
    chk(pushed.full === true, 'an event with no incremental range runs everything', JSON.stringify(pushed))
    const lost = cli('--event', 'pull_request', '--action', 'synchronize', '--base', '0000000000000000000000000000000000000000', '--head', B)
    chk(lost.full === true, 'a range the checkout cannot read runs everything', JSON.stringify(lost))
    // A tree is no commit, though git would diff it: the range is refused before anything is read.
    const tree = cli('--event', 'pull_request', '--action', 'synchronize', '--base', g('rev-parse', `${A}^{tree}`), '--head', B)
    chk(tree.full === true, 'and so does an end of the range that is no commit', JSON.stringify(tree))
    const noCi = plant({ 'docs/x.md': 'x\n' })
    const gn = (...a) => execFileSync('git', a, { cwd: noCi, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    gn('init', '-q')
    gn('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '-A')
    gn('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'one')
    writeFileSync(join(noCi, 'apps-x.ts'), 'x\n')
    gn('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '-A')
    gn('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'two')
    const broken = spawnSync(process.execPath, [CLI, '--event', 'pull_request', '--action', 'synchronize', '--base', gn('rev-parse', 'HEAD~1'), '--head', gn('rev-parse', 'HEAD'), '--json'], { cwd: noCi, encoding: 'utf8', env: { ...process.env, CI_AFFECTED_ROOT: noCi } })
    const b = (() => { try { return JSON.parse(broken.stdout.trim().split('\n').pop()) } catch { return {} } })()
    chk(b.full === true && b.trusted === false, 'a selection that fails (no workflow to read) runs everything and trusts nothing', broken.stdout + broken.stderr)
    rmSync(noCi, { recursive: true, force: true })
    mkdirSync(join(repo, 'docs/rehearsals'), { recursive: true })
    writeFileSync(join(repo, 'docs/rehearsals/latest.json'), JSON.stringify({ result: 'passed', commit: B, at: '2026-11-02', verify: 'all', selection: { full: false, suites: ['notes-api', 'notes-ui', 'notes-visit'], web: true, harness: true, sweepMutate: false } }))
    g('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '-A')
    g('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'rehearsed')
    const C = g('rev-parse', 'HEAD')
    const trusted = cli('--event', 'pull_request', '--action', 'synchronize', '--base', A, '--head', C)
    chk(trusted.trusted === true && trusted.suites?.join(',') === 'notes-api,notes-ui,notes-visit', 'the code and its passing rehearsal’s record, pushed together, are trusted', JSON.stringify(trusted))
    writeFileSync(join(repo, 'apps/web/src/components/note-card.tsx'), 'export const NoteCard = () => null\n')
    g('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qam', 'more code')
    const D = g('rev-parse', 'HEAD')
    const after = cli('--event', 'pull_request', '--action', 'synchronize', '--base', A, '--head', D)
    chk(after.trusted === false, 'code pushed after the rehearsal is not trusted to it', JSON.stringify(after))
    rmSync(repo, { recursive: true, force: true })
  }

  console.log('\n▶ the real tree')
  {
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
    const lines = ci.split('\n')
    const from = lines.indexOf('  postgres-harnesses:')
    const to = lines.findIndex((l, i) => i > from && /^  [A-Za-z0-9_-]+:\s*$/.test(l))
    const starts = []
    for (let i = from; i < (to === -1 ? lines.length : to); i += 1) if (/^      - (name|uses|run|id):/.test(lines[i])) starts.push(i)
    const wrong = []
    let gated = 0
    starts.forEach((st, k) => {
      const body = lines.slice(st, starts[k + 1] ?? to).filter((l) => !l.trim().startsWith('#'))
      const names = [...new Set(body.flatMap((l) => [...l.matchAll(/\bnode\s+test\/e2e\/([A-Za-z0-9._-]+)\.mjs\b/g)].map((m) => m[1])))]
      if (!names.length) return
      const want = `        if: needs.changes.outputs.full == 'true' || ${names.map((n) => `contains(needs.changes.outputs.suites, '|${n}|')`).join(' || ')}`
      if (!body.includes(want)) wrong.push(lines[st].trim())
      else gated += 1
    })
    chk(gated >= 100 && !wrong.length, `every Postgres-harness suite step runs when everything does or its own name is selected (${gated} of them)`, wrong.slice(0, 3).join('; '))
    const real = jobSuites(ci)
    const r = affected({ root: ROOT, changes: [{ path: 'packages/imports/src/grid.ts', status: 'M' }], suites: real })
    chk(!r.full && r.suites.includes('clickup-current-export') && r.suites.length < real.harness.length / 2,
      'a change to the import engine runs the suite importing a ClickUp export, and not half the harnesses',
      r.full ? r.reasons[0] : `${r.suites.length} of ${real.harness.length}`)
  }
} finally {
  rmSync(TREE_DIR, { recursive: true, force: true })
}

console.log(`\n${pass} passed, ${fail} failed`)
let blind = 0
if (process.argv.includes('--mutate') && !process.env.CI_AFFECTED_LIB_UNDER_TEST && !process.env.CI_AFFECTED_CLI_UNDER_TEST) {
  const alive = (mutant) => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(mutant).href)})`], { encoding: 'utf8' })
    return { ok: r.status === 0, why: r.stderr }
  }
  blind += proveMutationsBite({
    subject: join(HERE, 'lib', 'ci-affected.mjs'),
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'CI_AFFECTED_LIB_UNDER_TEST',
    label: 'the selection',
    alive,
    mutations: [
      ['no-importers', 'const reach = dependents(g, [...seeds].filter((s) => g.files.has(s)))', 'const reach = new Set([...seeds].filter((s) => g.files.has(s)))'],
      ['unknown-runs-nothing', "  for (const [re, cls] of PATH_RULES) if (re.test(path)) return cls\n  return 'full'", "  for (const [re, cls] of PATH_RULES) if (re.test(path)) return cls\n  return 'none'"],
      ['prose-runs', "[/^docs\\//, 'none'],", "[/^docs\\//, 'source'],"],
      ['shell-ignored', 'if (shell) full(', 'if (false) full('],
      ['shared-ignored', 'if (shared) full(', 'if (false) full('],
      ['no-bridge', 'if (!out.full && apiWords.size) {', 'if (false) {'],
      ['links-are-calls', '    if (res.some((re) => re.test(src))) return true', "    if (res.some((re) => re.test(src)) || new RegExp(`'${word}`).test(src)) return true"],
      ['bridge-brings-pages', "          if (!/^(apps\\/web\\/src|packages\\/ui\\/src)\\//.test(f) || WEB_ROOTS.has(f)) continue\n", "          if (!/^(apps\\/web\\/src|packages\\/ui\\/src)\\//.test(f) || WEB_ROOTS.has(f)) continue\n          if (/^apps\\/web\\/src\\/routes\\//.test(f)) for (const w of routeKeywords(f)) pageWords.add(w)\n"],
      ['no-page-words', "    .filter((s) => s && s !== 'app' && s !== 'index' && !s.startsWith('$') && !s.startsWith('_') && !s.startsWith('('))", '    .filter(() => false)'],
      ['no-element-ids', '    ids.add(m[3] ? `${id}…` : id)', '    void id'],
      ['deleted-followed', "    if (status?.startsWith('D')) {\n      full(", "    if (false) {\n      full("],
      ['any-catalogue-line', '    if (!m) return null', '    if (!m) continue'],
      ['unused-key-narrows', "        if (!users.length) {\n          full(", "        if (false) {\n          full("],
      ['no-template-keys', 'for (let n = parts.length - 1; n >= 1; n -= 1)', 'for (let n = 0; n >= 1; n -= 1)'],
      ['unnamed-routes-narrow', "          if (!words.size) {\n            full(", "          if (false) {\n            full("],
      ['sweep-never-wanted', "      out.sweepMutate = true\n      out.harness = true", "      out.sweepMutate = false\n      out.harness = true"],
      ['package-unresolved', "'@rundesk/imports': 'packages/imports/src'", "'@rundesk/importz': 'packages/imports/src'"],
    ],
  })
  blind += proveMutationsBite({
    subject: join(HERE, 'ci-affected.mjs'),
    caseFile: fileURLToPath(import.meta.url),
    envVar: 'CI_AFFECTED_CLI_UNDER_TEST',
    label: 'the trust and the command',
    alive,
    mutations: [
      ['trusts-a-failure', "if (record.result !== 'passed')", 'if (false)'],
      ['trusts-code-after', 'if (after.length) return { trusted: false', 'if (false) return { trusted: false'],
      ['trusts-any-commit', 'if (!record.commit || !isAncestor(record.commit))', 'if (!record.commit)'],
      ['trusts-half-verify', "if (record.verify !== 'all')", 'if (false)'],
      ['trusts-a-selection-for-everything', 'if (needed.full) return { trusted: false', 'if (false) return { trusted: false'],
      ['trusts-missing-suites', 'if (missing.length) return', 'if (false) return'],
      ['trusts-without-browser', 'if (needed.web && !sel.web) return', 'if (false) return'],
      ['trusts-without-sweep', 'if (needed.sweepMutate && !sel.sweepMutate)', 'if (false)'],
      ['narrows-any-event', "if (event && !(event === 'pull_request' && action === 'synchronize')) return EVERYTHING(", 'if (false) return EVERYTHING('],
      ['narrows-a-lost-range', 'if (!isCommit(base) || !isCommit(head)) return EVERYTHING(', 'if (false) return EVERYTHING('],
      ['no-fail-open', "    out = EVERYTHING(`the selection failed", "    out = { code: false, full: false, suites: [], web: false, harness: false, sweepMutate: false, reasons: [] } || EVERYTHING(`the selection failed"],
    ],
  })
}
process.exitCode = fail === 0 && blind === 0 ? 0 : 1
