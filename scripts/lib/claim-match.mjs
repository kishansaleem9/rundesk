/**
 * Matching a break patch's `# Reddens:` claim against a suite's own text.
 *
 * ONE COPY, BECAUSE THERE WERE TWO AND THEY HAD ALREADY DRIFTED.
 *
 * `check-break-claims.mjs` asks "is the sentence this patch quotes really in
 * the suite it names?" and `check-break-coverage.mjs` asks "which suite does
 * this patch belong to?" — different questions over the same matcher, so both
 * files carried their own `norm`, `MIN_WORDS` and `findsClaim`. By the time
 * they were pulled out here they no longer agreed:
 *
 *   - claims folded en and em dashes to `-`; coverage did not;
 *   - claims unescaped a `\`` (a backtick inside a template literal, which is
 *     how every check sentence naming a frame time is written); coverage did
 *     not.
 *
 * Two checkers disagreeing about whether the same claim is in the same suite is
 * the worst kind of drift here, because each one's answer looks authoritative
 * on its own: a patch can be attributed to a suite by one file and reported as
 * quoting a sentence that suite does not have by the other, and both numbers
 * get published. Neither is lying; they are running different matchers.
 *
 * So the matcher lives here and nowhere else. The two checkers keep their own
 * claim EXTRACTION — the shapes of the header they accept, and what they do
 * with a sentence they cannot place — because those really are different jobs.
 */

/*
 * NORMALISE UNTIL ONLY THE WORDS ARE LEFT. Four separate spellings of the same
 * sentence were reported as four missing checks:
 *
 *   - the patch escapes its inner quotes (`\"My runs\"`) because it is inside a
 *     Python string; the suite does not;
 *   - the patch writes `'create a '` and the suite writes `"create a "`, so
 *     every quote character is DROPPED rather than folded to a sentinel: the
 *     suite often quotes a label INSIDE the sentence (`and "Find Blockers" now
 *     names …`) where the patch's claim does not, and a sentinel there breaks
 *     the match just as surely as the original character did;
 *   - the suite uses `’` where the patch uses `'`;
 *   - the suite escapes its BACKTICKS — `with frame \`12:40\`'s own headline` —
 *     because the check sentence is itself a template literal, and the patch
 *     quoting it writes the frame time the way a person reads it. 23 check
 *     sentences across 15 suites name a frame that way, so this is the shape of
 *     the sentences and not one patch's typo. `po-2-headline-reworded` was the
 *     one it happened to catch, whose claim differed from the check by two
 *     backslashes and nothing else.
 *
 * None of those is a difference in what the check SAYS, and a checker that
 * reports them is just noise with a failure's exit code.
 *
 * NOTE WHAT THIS DOES *NOT* DO. An escape is removed; the backtick itself
 * stays, unlike the quote characters above, which are dropped. A claim still
 * has to name the same frame — `12:41` does not match `12:40` — so this is a
 * normalisation and not the matcher being loosened until today's failure goes
 * away. Break-tested by retyping the time in that claim and watching it come
 * back as CLAIM NOT IN SUITE.
 */
export const norm = (s) =>
  s
    .replace(/\\(["'`\\])/g, '$1')
    .replace(/[‘’ʼ'"“”]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

/*
 * A CHECK SENTENCE IS OFTEN A TEMPLATE LITERAL, so its literal text is not in
 * the file at all: `the grid is four columns wide at ${VIEWPORT.width}px`
 * cannot be found by searching for "…at 1440px". Matching on a literal fragment
 * instead is the difference between a checker that finds rotted claims and one
 * that reports every interpolated sentence as rotted.
 *
 * The fragment cannot be the claim's PREFIX, which is what this tried first:
 * the interpolation is often at the START — `<name> really exists in this run's
 * own space`, `every one of the ${n} tiles offered` — leaving a prefix far too
 * short to match on. So the longest contiguous fragment ANYWHERE in the
 * sentence is looked for, longest first.
 *
 * MEASURED IN WORDS, NOT CHARACTERS, and this is where the tuning stops. A
 * 30-character floor still failed `the type picker offers all ${n} field types`
 * and `the modal's picker offers all ${n} types`, whose literal runs are 27 and
 * 30 characters — so the floor was wrong, not the claims, and the obvious move
 * is to lower it. That way lies a matcher that matches anything, which is a
 * check that cannot fail.
 *
 * Five consecutive words is the rule instead, because it is a statement about
 * how specific the evidence is rather than a number picked to make today's
 * failures go away: five words of a check's own sentence do not appear by
 * accident in a different check.
 *
 * AND IT STILL MATCHES THE WRONG CHECK WHERE TWO DIFFER BY ONE WORD.
 * `mp-7-flat-bars` claimed "the Fast tier's Speed bar is visibly longer than
 * the DEEP tier's" and the suite compares Fast against MAX. The shared
 * fragment — "Speed bar is visibly longer than the" — is six words, so the
 * claim verified and the patch was aimed at a comparison that does not exist.
 * It ran green, correctly, and only running it told anyone.
 *
 * A FRAGMENT LONG ENOUGH NOT TO APPEAR BY ACCIDENT IS NOT THE SAME AS A
 * FRAGMENT THAT PINS THE MEANING. This is a real limit of matching on text and
 * not one to tune away: requiring the whole sentence would reject every
 * template literal, which is where this started. Where a suite holds two
 * checks of the same shape over different subjects, the claim can only be
 * confirmed by the run. What is left over after this is reported, and
 * some of it is a patch paraphrasing where it should have quoted — which is a
 * real defect in the patch, and not one the matcher should be bent to hide.
 */
export const MIN_WORDS = 5

export const findsClaim = (hay, q) => {
  if (hay.includes(q)) return true
  const w = q.split(' ')
  for (let len = w.length - 1; len >= MIN_WORDS; len--) {
    for (let i = 0; i + len <= w.length; i++) {
      if (hay.includes(w.slice(i, i + len).join(' '))) return true
    }
  }
  return false
}

/**
 * The quoted sentences in a `# Reddens:` block, tolerating a `\"` inside one.
 *
 * DOUBLE QUOTES AND SINGLE QUOTES, because 29 patches used the second and were
 * counted as quoting nothing. `tai-*`, `tat-*` and `tmn-*` write
 * `# Reddens: task-mentions -- 'the row itself says why'`, which is a quoted
 * check sentence by any reading — and 26 of the 29 verified against their
 * suite the moment the matcher was allowed to see them, with no rewriting at
 * all. A claim that is quoted, correct and unread is the worst of the three
 * states this file has: it looks checked.
 *
 * THE APOSTROPHE IS WHY THIS WAS NOT DONE FIRST, and it is a real hazard.
 * `the first person's row holds the first person's work` contains two
 * apostrophes, and a naive single-quote scan reads the span BETWEEN them —
 * `s row holds the first person` — which is not a sentence and would be
 * reported as a claim no suite contains.
 *
 * So an opening `'` must be preceded by the start of the block, whitespace, or
 * an opening bracket, and a closing `'` must be followed by the end,
 * whitespace, or punctuation. A possessive fails both tests: it sits directly
 * against word characters on the inside. Measured on all 798 patches: this
 * finds the 29 real ones and none of the possessives.
 */
const DOUBLE = /"((?:[^"\\]|\\.){8,}?)"/g
const SINGLE = /(^|[\s([<\u2014-])'((?:[^'\\]|\\.){8,}?)'(?=$|[\s,.;:!?)\]>\u2014-])/g
export const quotedIn = (block) => {
  const found = [...block.matchAll(DOUBLE)].map((m) => norm(m[1]))
  if (found.length) return found
  return [...block.matchAll(SINGLE)].map((m) => norm(m[2]))
}

/*
 * THE WHOLE SENTENCE, NOT A FRAGMENT OF ONE (`found-25-sep/claims-confirmed-by-a-fragment`).
 *
 * `findsClaim` accepts any five consecutive words of a claim found anywhere in
 * the suite. `gcm-11` claimed a check as it read BEFORE it was restated; the old
 * sentence was in no suite, yet eight of its words were, so the claim counted as
 * verified — and a run of the patch as a reddening. Only reading the report
 * exactly showed it.
 *
 * So a claim is read against the suite's SENTENCES, not its text:
 *   - equal to one of its string literals (normalised as `norm` does), or
 *   - fully matching one of its template literals, each `${…}` standing for any
 *     text — a template with fewer than 16 literal characters is not a
 *     sentence, since `${a}` alone would match anything — or
 *   - at least MIN_WORDS consecutive words of a template sentence's literal
 *     text, because what a template prints cannot be quoted in advance.
 * A clause of a longer literal sentence, a label the page shows, or a sentence
 * the suite no longer has, is none of these. Measured 28 September: 392 of
 * 2,002 claims were clauses; 241 were re-aimed mechanically and the rest by
 * reading.
 */
// `norm`, keeping one space where the piece began or ended with one, so pieces
// between interpolations join as the sentence does.
const innerNorm = (s) => `${/^\s/.test(s) ? ' ' : ''}${norm(s)}${/\s$/.test(s) && norm(s) ? ' ' : ''}`
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const INTERPOLATION = /\$\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/
export const TEMPLATE_MIN_CHARS = 16

/**
 * The string and template literals of JavaScript source, in order, with the
 * text between them — a small tokenizer, because a regex over the raw source is
 * derailed by the first apostrophe in a comment (`panel's` in `list-customize`
 * paired with a later quote, and no sentence after it was seen) or a quote in a
 * regex literal. Comments are skipped; a `/` after an operator or bracket opens
 * a regex literal, read to its closing `/` outside a character class.
 */
const tokensOf = (src) => {
  const out = []
  let i = 0
  let prev = ''
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      out.push({ kind: 'str', body: src.slice(i + 1, j) }); prev = 'x'; i = j + 1; continue
    }
    if (c === '`') {
      let j = i + 1
      let depth = 0
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue }
        if (depth === 0 && src[j] === '`') break
        if (src[j] === '$' && src[j + 1] === '{') { depth++; j += 2; continue }
        if (depth > 0 && src[j] === '{') depth++
        else if (depth > 0 && src[j] === '}') depth--
        j++
      }
      out.push({ kind: 'tpl', body: src.slice(i + 1, j) }); prev = 'x'; i = j + 1; continue
    }
    if (c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) {
      let j = i + 1
      let cls = false
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '[') cls = true
        else if (src[j] === ']') cls = false
        else if (src[j] === '/' && !cls) break
        j++
      }
      prev = 'x'; i = j + 1; continue
    }
    if (c === '+') out.push({ kind: 'plus' })
    else if (!/\s/.test(c)) out.push({ kind: 'other' })
    if (!/\s/.test(c)) prev = /[A-Za-z0-9_$)\]]/.test(c) ? 'x' : c
    i++
  }
  return out
}

/**
 * A suite's sentences: its string literals, its template literals as patterns,
 * and a sentence built by `+` from pieces, joined — `'the first half ' + 'and
 * the rest'` is one check sentence.
 */
export const sentencesOf = (src) => {
  const literals = new Set()
  const templates = []
  // Each literal's text as the source writes it, for a tool that quotes it.
  const raw = new Map()
  const add = (body, isTemplate) => {
    if (!raw.has(norm(body))) raw.set(norm(body), body.replace(/\\(['"`\\])/g, '$1'))
    if (isTemplate && INTERPOLATION.test(body)) {
      const parts = body.split(new RegExp(INTERPOLATION.source)).map(innerNorm)
      // The source form, `${…}` and all, is how a claim quotes a sentence whose
      // values change from run to run.
      literals.add(norm(body))
      if (parts.join('').replace(/\s/g, '').length < TEMPLATE_MIN_CHARS) return
      templates.push({ re: new RegExp(`^${parts.map(escRe).join('.+?')}$`), text: norm(parts.join(' ')) })
    } else {
      literals.add(norm(body))
    }
  }
  const toks = tokensOf(src)
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]
    if (t.kind !== 'str' && t.kind !== 'tpl') continue
    add(t.body, t.kind === 'tpl')
    // A run of pieces joined by `+`: the whole is a sentence too.
    let body = t.body
    let tpl = t.kind === 'tpl'
    let m = k
    while (toks[m + 1]?.kind === 'plus' && (toks[m + 2]?.kind === 'str' || toks[m + 2]?.kind === 'tpl')) {
      body += toks[m + 2].body
      tpl = tpl || toks[m + 2].kind === 'tpl'
      m += 2
      add(body, tpl)
    }
  }
  return { literals, templates, raw }
}

/** Whether the normalised claim `q` is one of these sentences, whole — see above. */
export const claimedWhole = (sentences, q) => {
  if (sentences.literals.has(q)) return true
  const long = q.split(' ').length >= MIN_WORDS
  return sentences.templates.some((t) => t.re.test(q) || (long && t.text.includes(q)))
}
