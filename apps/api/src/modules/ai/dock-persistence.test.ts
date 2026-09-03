import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Walk up to the workspace root: this compiles to CJS, so no import.meta. */
function workspaceRoot(from: string): string {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const up = dirname(dir)
    if (up === dir) throw new Error('workspace root not found')
    dir = up
  }
}
const read = (rel: string) => readFileSync(join(workspaceRoot(process.cwd()), rel), 'utf8')

/** Balanced text starting at the first `open` at or after `from`. */
function balancedFrom(source: string, from: number, open: string, close: string): string {
  const start = source.indexOf(open, from)
  if (start < 0) return ''
  let depth = 0
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === open) depth += 1
    else if (source[i] === close) {
      depth -= 1
      if (depth === 0) return source.slice(start + 1, i)
    }
  }
  return ''
}

/**
 * A function's BODY, not its parameter list.
 *
 * The first draft of this file balanced braces from the signature and got
 * `{ skipEcho?: boolean }` — the destructured options object — which is a
 * reminder that "the first bracket after the name" is rarely the one you want.
 * Walks past the parameter parens first.
 */
function functionBody(source: string, signature: string): string {
  const at = source.indexOf(signature)
  if (at < 0) return ''
  const params = source.indexOf('(', at)
  if (params < 0) return ''
  let depth = 0
  let i = params
  for (; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1
    else if (source[i] === ')') {
      depth -= 1
      if (depth === 0) break
    }
  }
  return balancedFrom(source, i, '{', '}')
}

/**
 * §G13-8 — the docked assistant keeps what it is told.
 *
 * `/ai` owned a thread and handed it down; the DOCK was rendered with none, so
 * every conversation held in it vanished on close and all four per-message
 * actions were `disabled={!threadId}` permanently. The dock is the assistant
 * most people actually use, so those four were greyed out for most people all
 * the time.
 *
 * Checked HERE, from source, rather than in a browser, and that is a decision
 * worth writing down: the composer is disabled outright without an
 * `ANTHROPIC_API_KEY` ("Add ANTHROPIC_API_KEY to your .env to enable AI
 * features"), and neither this machine nor CI has one. A browser check would
 * therefore pass against a dock nobody could type into — which is precisely the
 * kind of check this repository keeps finding and deleting.
 */
describe('§G13-8 the AI dock is not a scratch pad', () => {
  const shell = read('apps/web/src/routes/app.tsx')
  const panel = read('apps/web/src/components/ai-panel.tsx')

  it('the docked panel is given somewhere to keep the conversation', () => {
    assert.ok(shell.includes('<AiPanel'), 'the dock does not render an AiPanel')
    /*
     * Either it is handed a thread or it is told to mint one. Both are
     * acceptable; neither being present is the defect. Asserted on the effect
     * rather than on one spelling, so a future refactor that passes a thread
     * down instead still satisfies it.
     */
    const dock = shell.slice(shell.indexOf('<AiPanel'), shell.indexOf('<AiPanel') + 1200)
    assert.ok(
      /\bpersist\b/.test(dock) || /threadId=/.test(dock),
      'the dock keeps nothing: no thread passed and no persist',
    )
  })

  it('and the panel can actually mint one', () => {
    assert.match(panel, /persist\??\s*[:=]/, 'the panel has no persist prop')
    assert.match(
      panel,
      /chat\s*\n?\s*\.create\(/,
      'nothing in the panel ever creates a thread',
    )
  })

  it('but not before there is anything to keep', () => {
    /*
     * Minting on OPEN would file an empty thread in the sidebar every time
     * somebody pressed the assistant icon and thought better of it. The create
     * has to live in the send path, not in an effect that runs on mount.
     */
    const send = functionBody(panel, 'async function sendMessage')
    assert.ok(send, 'could not find sendMessage')
    assert.match(send, /\.create\(/, 'the thread is not minted when a message is sent')

    for (const effect of panel.match(/useEffect\(\(\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\)/g) ?? []) {
      assert.ok(
        !/chat\s*\.?\s*\n?\s*\.create\(/.test(effect),
        `a thread is created from an effect, so opening the dock files an empty one:\n${effect.slice(0, 200)}`,
      )
    }
  })

  it('and the action row is handed the thread in force, not the raw prop', () => {
    /*
     * The action row gates itself on the `threadId` IT receives — which is
     * right, and is not what was wrong. What was wrong is one level up: the
     * panel handed down its own unresolved prop, so a panel that minted a
     * thread would still grey the row out. The same defect wearing the fix as
     * a hat.
     *
     * So the assertion is on what gets passed, not on how the row reads it.
     */
    const passed = /\n\s*threadId=\{([^}]+)\}/.exec(panel)?.[1]?.trim()
    assert.ok(passed, 'the panel never hands a thread to its action row')
    assert.notEqual(
      passed,
      'threadId',
      'the action row is given the raw prop, so a thread the panel minted itself leaves it greyed out',
    )
  })
})

/**
 * §G14-15 — a cited meeting arrives at the model WITH its notes.
 *
 * Checked from source, and the reason is worth stating rather than glossing.
 * `enrichKnowledgeContent` feeds the assembled context to the model, and
 * without an `ANTHROPIC_API_KEY` the answer path never reaches the model at
 * all — it returns the deterministic fallback, which lists the sources and
 * never touches the hydrated text. So removing this branch changes nothing
 * observable in an end-to-end run: break-testing confirmed it, the suite passed
 * 25/25 with hydration disabled. A behavioural check here would be a check that
 * cannot fail.
 */
describe('§G14-15 a cited meeting brings its notes with it', () => {
  const ai = read('apps/api/src/modules/ai/ai.service.ts')

  it('hydrates meeting hits from the notes column', () => {
    const body = functionBody(ai, 'private async enrichKnowledgeContent')
    assert.ok(body, 'could not find enrichKnowledgeContent')
    assert.match(
      body,
      /meetingIds\.length\s*\n?\s*\?/,
      'meeting hits are no longer hydrated — a meeting reaches the model as a bare title, and a heading grounds nothing',
    )
    assert.match(body, /meetings\.notes/, 'the hydration reads something other than the notes')
  })

  it('and a meeting is decided on explicitly, not by falling through', () => {
    /*
     * The fall-through default is documented as being for types SearchService
     * has already scoped. Meetings are not — they come from the embeddings
     * table — so a branch that happens to be right for a reason its comment
     * does not describe is one refactor away from being wrong.
     */
    assert.match(
      ai,
      /if \(type === 'meeting'\) return true/,
      'meeting access is left to the fall-through default again',
    )
  })
})
