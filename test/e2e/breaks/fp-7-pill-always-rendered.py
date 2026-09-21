# The pill drawn even when no block is running, with an em dash where the
# countdown goes. The frames draw no pill before a block is on the grid, and a
# control that is present-but-empty is the hardest kind of stale to notice —
# it looks like a feature that is merely idle.
# Reddens: focus-pill:
#   "and draws no pill — the frames show none before a block is dropped on the grid"
import io
p = '/home/user/rundesk/apps/web/src/components/app-topbar.tsx'
a = """  const running = useRunningFocusBlock(workspaceId)
  if (!running) return null
"""
b = """  const running = useRunningFocusBlock(workspaceId) ?? { label: '—', remaining: '—' }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('app-topbar.tsx: the pill is always in the header, empty when nothing is running.')
