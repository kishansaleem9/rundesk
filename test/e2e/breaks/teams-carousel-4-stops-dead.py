# Clamp instead of wrap. The arrow stays live-looking and stops responding at
# the end — a control that reads as broken rather than finished, and an end
# state no frame in the video ever draws.
# Reddens: teams-empty-state: "and it wraps rather than stopping dead"
import io
p = "/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx"
a = "                      onClick={() => setCardIndex((i) => (i + 1) % EMPTY_CARDS.length)}"
b = "                      onClick={() => setCardIndex((i) => Math.min(i + 1, EMPTY_CARDS.length - 1))}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-teams-page.tsx: the carousel clamps at the last card instead of wrapping.')
