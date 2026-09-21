# The header pill removed entirely — the state this row was opened over, where
# `use-focus-tab-title.ts` computed the countdown and the only consumer in the
# codebase wrote `document.title`. The ledger said "in the header" and the
# header had nothing in it.
# Reddens: focus-pill: the whole run — the pill never appears, so the fixture
#   for the ending block throws and the check count comes up short.
import io
p = '/home/user/rundesk/apps/web/src/components/app-topbar.tsx'
a = """  const running = useRunningFocusBlock(workspaceId)
  if (!running) return null
"""
b = """  const running = useRunningFocusBlock(workspaceId)
  if (running || !running) return null
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app-topbar.tsx: FocusBlockPill renders nothing at all — the header countdown is gone again.')
