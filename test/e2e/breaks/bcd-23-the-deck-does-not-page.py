# The arrows and the keys move nothing: the deck stays on its first slide.
# Reddens: brain-comments-and-decks: "the Artifacts list opens the deck, paged through as frame 16:55 pages it: the arrows, ← / →, and where you are"
import io
p = '/home/user/rundesk/apps/web/src/components/brain-artifacts.tsx'
a = '  const go = (step: number) => setAt((i) => Math.min(Math.max(i + step, 0), Math.max(total - 1, 0)))\n'
b = '  const go = (step: number) => setAt((i) => i + 0 * step)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-23-the-deck-does-not-page: The arrows and the keys move nothing: the deck stays on its first slide.')
