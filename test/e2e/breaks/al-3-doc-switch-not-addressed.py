# Switching docs stops changing the address, while landing on docs still names
# the one it opened.
#
# The split is what makes it plausible and what makes it bad. `selectedDocId`
# still READS `search.doc`, so an incoming `?doc=<id>` link opens that doc and
# the auto-select on arrival still writes one. Only the writer moves to local
# state — the kind of change somebody makes to stop a `replace: true`
# navigation firing on every click in a tree they are browsing through.
#
# So the address is right exactly once, when you arrive, and then silently
# describes a doc you are no longer reading. That is worse than never writing
# it: a URL that was correct and drifted is one people trust. Copying it after
# ten minutes of writing sends somebody to whatever you opened first.
#
# TWO CHECKS, AND THE SUITE SEEDS A SECOND DOC FOR EXACTLY THIS. With one doc
# "coming back reopens the same one" is true however broken the addressing is,
# because the auto-select lands on it regardless — which is the already-first
# defect, and the suite's own comment says so. The second doc is the one that
# has to appear in the URL and then come back.
#
# "landing on docs names the doc it opened" stays GREEN, correctly: the
# auto-select is a different call site and this does not touch it.
#
# Reddens: addressability-live: "switching doc changes the address" and
#   "and coming back to that address reopens THAT doc, not the first one"
import io
p = '/home/user/rundesk/apps/web/src/components/docs-panel.tsx'
a = """  const selectedDocId = search.doc ?? null
  const setSelectedDocId = (id: string | null) =>
    navigate({
      to: '/app/$workspaceId/docs',
      params: { workspaceId },
      search: (prev: Record<string, unknown>) => ({ ...prev, doc: id ?? undefined }),
      replace: true,
    })
"""
b = """  // Browsing the tree should not fire a navigation per click; an incoming
  // ?doc= link still opens the doc it names.
  const [pickedDocId, setPickedDocId] = useState<string | null>(null)
  const selectedDocId = pickedDocId ?? search.doc ?? null
  const setSelectedDocId = (id: string | null) => setPickedDocId(id)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('docs-panel.tsx: switching docs no longer changes the address.')
