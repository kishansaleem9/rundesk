# The pager clamps instead of wrapping, so → dies on the last card. An arrow that
# stops dead is one people press twice and conclude is broken.
# Reddens: planner-onboarding: "→ walks all four cards and wraps back to the first"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '  const step = (delta: number) => setCard((c) => (c + delta + CARDS.length) % CARDS.length)\n'
b = '  const step = (delta: number) => setCard((c) => Math.min(CARDS.length - 1, Math.max(0, c + delta)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the carousel no longer wraps.')
