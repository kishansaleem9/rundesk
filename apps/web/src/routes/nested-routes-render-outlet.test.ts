import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * A route with children must render an `<Outlet />`, or its children are dead.
 *
 * TanStack shadows a child route with its parent's component when that
 * component renders no Outlet. Nothing errors: navigating to the child renders
 * the PARENT page, so the URL is right, the page looks plausible, and the
 * feature is simply unreachable. Only someone who opens the child by URL and
 * reads the screen carefully notices.
 *
 * This repo has shipped that bug twice.
 *
 *   24 Jun 2026 — /time/approvals rendered the Time page; /sprints/:id and
 *   /goals/:id rendered their lists. Caught by an E2E smoke run.
 *
 *   25 Aug 2026 — /skills/:id rendered the Skills hub, so the whole skill
 *   detail page (the playbook, its memory, its connections) could not be
 *   reached. Caught on the deployed instance by verify-ui §15b, three commits
 *   after it was written.
 *
 * Both times the fix was the same: make the parent a layout that renders an
 * Outlet and move its page to an index route. This is a structural check for
 * the whole class, so the third time is caught before it ships.
 */

const ROUTES = dirname(fileURLToPath(import.meta.url))

/** Read every local module a route file imports, one hop deep. */
function relativeImportsOf(source: string, file: string): string[] {
  const out: string[] = []
  for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
    for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
      try {
        out.push(readFileSync(join(ROUTES, `${match[1]}${ext}`), 'utf8'))
        break
      } catch {
        // Next candidate extension; a bare directory or a missing file is not
        // an error here — this is a best-effort widening of the search.
      }
    }
  }
  if (out.length === 0 && /from\s+'\./.test(source)) {
    throw new Error(`could not resolve any local import of ${file} — the guard would pass vacuously`)
  }
  return out
}

/** "app.$workspaceId.skills.lazy.tsx" → "app.$workspaceId.skills" */
function routeIdOf(file: string): string {
  return file.replace(/\.(lazy\.)?tsx$/, '').replace(/\.lazy$/, '')
}

describe('a route with children renders an Outlet', () => {
  const files = readdirSync(ROUTES).filter((f) => f.endsWith('.tsx'))
  const ids = new Set(files.map(routeIdOf))

  /** Ids that something else nests under — e.g. "…skills" for "…skills.$skillId". */
  const parents = new Set<string>()
  for (const id of ids) {
    const parts = id.split('.')
    for (let i = 1; i < parts.length; i++) {
      const candidate = parts.slice(0, i).join('.')
      if (ids.has(candidate)) parents.add(candidate)
    }
  }

  it('finds the nested sections it is meant to police', () => {
    // Guards the guard: if the filename convention changes and this set comes
    // back empty, every assertion below would pass vacuously.
    assert.ok(parents.size >= 3, `only found ${parents.size} nested section(s)`)
    assert.ok(parents.has('app.$workspaceId.skills'), 'skills is not being checked')
  })

  for (const parent of [...parents].sort()) {
    it(`${parent} does not shadow its children`, () => {
      // The component lives in the .lazy file when there is one.
      const lazy = `${parent}.lazy.tsx`
      const plain = `${parent}.tsx`
      const file = files.includes(lazy) ? lazy : plain
      const source = readFileSync(join(ROUTES, file), 'utf8')

      // A route file with no component at all is a pathless layout — TanStack
      // renders its children directly, so there is nothing to shadow.
      if (!/component\s*:/.test(source)) return

      // The Outlet is usually not in the route file: the route points at a
      // page, and the page renders it — sometimes conditionally, as
      // SpaceShell does (`if (isNested) return <Outlet />`). Checking only the
      // route file called that a bug when it is a perfectly good layout, so
      // follow the imports one hop and accept an Outlet in either place.
      const sources = [source, ...relativeImportsOf(source, file)]
      assert.ok(
        sources.some((text) => /<Outlet[\s/>]/.test(text)),
        `${file} sets a component, and neither it nor the component it imports ` +
          `renders <Outlet />. Its children will render the parent page instead ` +
          `of themselves. Make it a layout that returns <Outlet /> and move the ` +
          `page to ${parent}.index.lazy.tsx.`,
      )
    })
  }
})
