# THREE BUTTONS THAT LIGHT UP AND STORE NOTHING. The row is in the right
# place, it has the frame's three emoji, it takes the press — and the press
# goes nowhere. Indistinguishable from the real thing in any screenshot.
# Reddens: comment-thread: "pressing a reaction in the thread really records one against THIS comment"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "              onClick={() => onReact(root.id, emoji)}"
b = "              onClick={() => undefined}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the thread reactions are decoration.')
