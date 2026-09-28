# THE DEAD CONTROL. Both arrows render exactly as the frame draws them and
# neither moves the carousel — which a check that only counts buttons cannot
# see, and which is why the index is read before and after instead.
# Reddens: teams-empty-state: "pressing → advances it, as it advances between `20:57` and `21:02`"
import io
p = "/home/user/rundesk/apps/web/src/pages/workspace-teams-page.tsx"
a = "                      onClick={() => setCardIndex((i) => (i + 1) % EMPTY_CARDS.length)}"
b = "                      onClick={() => {}}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-teams-page.tsx: the next arrow renders and does nothing.')
