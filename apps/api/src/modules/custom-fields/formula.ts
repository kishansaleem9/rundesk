/**
 * 0158 — "Formula", frame `00:20`'s picker, tenth row of the `All` section.
 *
 * THE COMPUTE IS NOT DEFERRED. A formula over the task's own numeric fields is
 * arithmetic; nothing about it needs a provider key, so it is evaluated here
 * rather than stored as a shell with a note saying what it does not yet do.
 *
 * It follows `progress_auto` in the one decision that matters: the value is
 * DERIVED, never written. A number stored in `custom_field_values` would be
 * right at the moment it was written and wrong as soon as one of the fields it
 * reads changed — and a stored value nothing recomputes is exactly the defect
 * this audit keeps finding from the other side. `getValuesForTask` evaluates on
 * read; `setValue` refuses.
 *
 * The grammar is small and stated rather than implied, because a formula
 * language that quietly accepts what it cannot evaluate is the same trap:
 *
 *   expression := term (('+' | '-') term)*
 *   term       := unary (('*' | '/') unary)*
 *   unary      := '-'? primary
 *   primary    := NUMBER | '{' FIELD NAME '}' | '(' expression ')'
 *
 * There are no functions and no comparisons. Both are buildable later; neither
 * is in the frame, and offering `SUM()` that only sums two things would be a
 * control that can only ever say one thing.
 */

/** The field types a formula may read. Anything else is refused at create time. */
export const FORMULA_NUMERIC_TYPES = [
  'number',
  'money',
  'rating',
  'progress_manual',
  'progress_auto',
] as const

/**
 * `expression` is what the definer typed, and what the field shows; `compiled`
 * is the same expression with each field named by its id, `{#<id>}`, resolved
 * when it was saved — what is evaluated, and what a rename leaves standing
 * (`found-6-oct/field-checks-name-a-private-lists-fields`). A formula saved
 * before there was `compiled` reads its fields by name.
 */
export type FormulaConfig = { expression: string; compiled?: string }

/** A field named by id in a compiled expression: `#<id>`, as `{#<id>}` is read. */
export const FIELD_ID_REF = /^#([0-9a-f-]{36})$/i

/** Thrown for a bad expression. The service turns it into a 400 with this text. */
export class FormulaError extends Error {}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; name: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '(' | ')' }

const MAX_EXPRESSION_LENGTH = 500

function tokenize(input: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]!
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1
      continue
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')') {
      out.push({ kind: 'op', value: ch })
      i += 1
      continue
    }
    if (ch === '{') {
      const end = input.indexOf('}', i + 1)
      if (end === -1) throw new FormulaError('a field reference is missing its closing }')
      const name = input.slice(i + 1, end).trim()
      if (name === '') throw new FormulaError('an empty field reference {} means nothing')
      out.push({ kind: 'ref', name })
      i = end + 1
      continue
    }
    if (ch === '}') throw new FormulaError('a } with no { before it')
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let j = i
      let dots = 0
      while (j < input.length && ((input[j]! >= '0' && input[j]! <= '9') || input[j] === '.')) {
        if (input[j] === '.') dots += 1
        j += 1
      }
      const text = input.slice(i, j)
      if (dots > 1) throw new FormulaError(`"${text}" is not a number`)
      const value = Number(text)
      if (!Number.isFinite(value)) throw new FormulaError(`"${text}" is not a number`)
      out.push({ kind: 'num', value })
      i = j
      continue
    }
    throw new FormulaError(`"${ch}" is not something a formula can use`)
  }
  return out
}

/**
 * Parse and evaluate in one pass.
 *
 * `resolve` answers what a `{Field}` is worth on the task being read, or null
 * when it has no value. A single null makes the WHOLE result null — a formula
 * with a missing input has no honest number to show, and substituting zero
 * would report "0" for a field nobody has filled in, which reads as a real
 * measurement. That is the confident zero, in a box with a percent sign.
 *
 * When `resolve` is not given, the walk still happens: every operator and every
 * reference is visited, so a syntax error is found whether or not there is a
 * task to evaluate against. That is what `parseFormula` uses.
 */
function walk(tokens: Token[], resolve?: (name: string) => number | null) {
  let pos = 0
  /** Null propagates; `undefined` never appears. */
  let sawNull = false

  const peek = () => tokens[pos]
  const eat = (value: string) => {
    const t = tokens[pos]
    if (t && t.kind === 'op' && t.value === value) {
      pos += 1
      return true
    }
    return false
  }

  const primary = (): number => {
    const t = peek()
    if (!t) throw new FormulaError('the expression stops early — something is missing after the last operator')
    if (t.kind === 'num') {
      pos += 1
      return t.value
    }
    if (t.kind === 'ref') {
      pos += 1
      if (!resolve) return 0
      const v = resolve(t.name)
      if (v == null || !Number.isFinite(v)) {
        sawNull = true
        return 0
      }
      return v
    }
    if (t.value === '(') {
      pos += 1
      const inner = expression()
      if (!eat(')')) throw new FormulaError('a ( with no matching )')
      return inner
    }
    throw new FormulaError(`"${t.value}" cannot start a value`)
  }

  const unary = (): number => {
    if (eat('-')) return -unary()
    if (eat('+')) return unary()
    return primary()
  }

  const term = (): number => {
    let left = unary()
    for (;;) {
      if (eat('*')) {
        left = left * unary()
      } else if (eat('/')) {
        const right = unary()
        /*
         * DIVIDING BY ZERO IS NULL, NOT Infinity and not 0. Infinity is not a
         * number anybody wants rendered, and zero is the confident zero again:
         * "{Spent} / {Budget}" on a task with no budget has no answer, and
         * saying 0% would be an answer.
         */
        if (right === 0) sawNull = true
        left = right === 0 ? 0 : left / right
      } else {
        return left
      }
    }
  }

  const expression = (): number => {
    let left = term()
    for (;;) {
      if (eat('+')) left = left + term()
      else if (eat('-')) left = left - term()
      else return left
    }
  }

  const value = expression()
  if (pos < tokens.length) {
    const t = tokens[pos]!
    const shown = t.kind === 'num' ? String(t.value) : t.kind === 'ref' ? `{${t.name}}` : t.value
    throw new FormulaError(`"${shown}" is left over at the end — an operator is missing before it`)
  }
  return { value, sawNull }
}

/**
 * Check an expression and report which fields it reads.
 *
 * Throws `FormulaError` on anything it cannot evaluate. The names come back in
 * the order they were written, WITH duplicates removed, so the caller can check
 * each one exists exactly once.
 */
export function parseFormula(raw: unknown): { expression: string; refs: string[] } {
  if (typeof raw !== 'string') throw new FormulaError('a formula needs an expression')
  const expression = raw.trim()
  if (expression === '') throw new FormulaError('a formula needs an expression')
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new FormulaError(`an expression cannot be longer than ${MAX_EXPRESSION_LENGTH} characters`)
  }
  const tokens = tokenize(expression)
  if (tokens.length === 0) throw new FormulaError('a formula needs an expression')
  walk(tokens)
  const refs: string[] = []
  for (const t of tokens) {
    if (t.kind === 'ref' && !refs.includes(t.name)) refs.push(t.name)
  }
  return { expression, refs }
}

/**
 * The number this formula is worth on one task, or null.
 *
 * Null means "there is nothing honest to show": a referenced field has no
 * value, a referenced field no longer exists, or a division by zero. A caller
 * that wanted a fallback would have to choose one, and every choice available
 * is a claim about work nobody has done.
 */
export function evaluateFormula(
  expression: string,
  resolve: (name: string) => number | null,
): number | null {
  let tokens: Token[]
  try {
    tokens = tokenize(expression)
    const { value, sawNull } = walk(tokens, resolve)
    if (sawNull || !Number.isFinite(value)) return null
    // Two decimals. Floating point makes `0.1 + 0.2` render as
    // 0.30000000000000004 in a cell that is six characters wide.
    return Math.round(value * 100) / 100
  } catch {
    /*
     * A STORED EXPRESSION THAT NO LONGER PARSES READS AS NULL rather than
     * throwing. Every expression is validated on the way in, so this can only
     * happen to a row edited by hand — and one bad row must not 500 the whole
     * field list for the task it is on.
     */
    return null
  }
}

/** Read a stored config back. Shaped like `toProgressConfig`, for the same reason. */
export function toFormulaConfig(raw: unknown): FormulaConfig {
  if (!raw || typeof raw !== 'object') return { expression: '' }
  const expression = (raw as Partial<FormulaConfig>).expression
  const compiled = (raw as Partial<FormulaConfig>).compiled
  return {
    expression: typeof expression === 'string' ? expression : '',
    ...(typeof compiled === 'string' ? { compiled } : {}),
  }
}

/**
 * Each `{…}` of an expression, as the tokenizer reads one: from `{` to the next
 * `}`, its name trimmed. In the order they are written, duplicates kept.
 */
function refSpans(expression: string): Array<{ start: number; end: number; name: string }> {
  const out: Array<{ start: number; end: number; name: string }> = []
  let i = 0
  while (i < expression.length) {
    if (expression[i] === '{') {
      const end = expression.indexOf('}', i + 1)
      if (end === -1) break
      out.push({ start: i, end: end + 1, name: expression.slice(i + 1, end).trim() })
      i = end + 1
      continue
    }
    i += 1
  }
  return out
}

/** The expression with each field it names written as `{#<id>}`: `idOf` answers each name. */
export function compileFormula(expression: string, idOf: (name: string) => string): string {
  let out = ''
  let at = 0
  for (const ref of refSpans(expression)) {
    out += `${expression.slice(at, ref.start)}{#${idOf(ref.name)}}`
    at = ref.end
  }
  return out + expression.slice(at)
}

/**
 * The expression shown, with every reference the compiled one makes to
 * `fieldId` written under `name`: the shown and compiled expressions name the
 * same fields in the same order, one for one. Answers the expression as it was
 * when the two do not line up (a config written by hand).
 */
export function renameInFormula(config: FormulaConfig, fieldId: string, name: string): string {
  if (!config.compiled) return config.expression
  const shown = refSpans(config.expression)
  const ids = refSpans(config.compiled).map((r) => FIELD_ID_REF.exec(r.name)?.[1] ?? null)
  if (shown.length !== ids.length) return config.expression
  let out = ''
  let at = 0
  shown.forEach((ref, i) => {
    if (ids[i]?.toLowerCase() !== fieldId.toLowerCase()) return
    out += `${config.expression.slice(at, ref.start)}{${name}}`
    at = ref.end
  })
  return out + config.expression.slice(at)
}
