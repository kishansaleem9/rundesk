# The assistant is asked on every keystroke instead of once the typing stops.
#
# THE DEBOUNCE THAT LOOKS REDUNDANT. The search beside it re-keys on every
# keystroke and that is deliberate — a cheap index read — so a second effect
# with a 700ms timer and a cleanup looks like the same job done twice with
# extra machinery. Removing it makes `settledQuery` track `query`, which is
# what every other reader in the file does.
#
# The comment two lines above says what the difference is: an assistant call
# per keystroke is not a cheap index read. Nothing on screen changes — the
# answer still arrives, still renders, still matches what the server sent —
# and a fourteen-character query becomes fourteen model calls, each one billed
# and each one racing the last. It is the failure that shows up on an invoice
# rather than in a screenshot.
#
# ONE CHECK, AND IT IS THE ONLY ONE IN THE SUITE THAT COUNTS REQUESTS. The
# suite types the query with `pressSequentially` at 40ms a character precisely
# so that a per-keystroke call would fire many times, and then asserts
# `knowledgeStubCalls.length === 1` with the count in its own sentence. The two
# checks above it — that an answer appears, and that it is the server's answer
# — both pass, because the last call's answer is the one that lands.
#
# Reddens: command-palette: "asked the assistant once, not per keystroke"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
a = """  const [settledQuery, setSettledQuery] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setSettledQuery(query.trim()), 700)
    return () => clearTimeout(id)
  }, [query])
"""
b = """  // The search re-keys on every keystroke; one reader, one rule.
  const settledQuery = query.trim()
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('command-palette.tsx: the assistant is asked once per keystroke.')
