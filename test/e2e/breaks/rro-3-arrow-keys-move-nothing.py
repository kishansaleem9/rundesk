# THE GRIP TAKES FOCUS AND THE ARROW KEYS MOVE NOTHING: the keyboard's way in is a dead end.
# Reddens: rail-reorder: "pressing ↓ on Backlog’s grip moves it one place down, in the stored order and on the rail"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = "            onStep(e.key === 'ArrowUp' ? -1 : 1)\n"
b = "            void onStep\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rro-3-arrow-keys-move-nothing: ArrowUp and ArrowDown are swallowed and do nothing')
