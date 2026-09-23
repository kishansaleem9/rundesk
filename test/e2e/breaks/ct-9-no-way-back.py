# A PANEL THAT REPLACES THE LIST AND CANNOT BE LEFT. The control is drawn,
# it takes the press, and the comments column stays a thread for the rest of
# the session — a trap rather than a panel, and the reason the frame puts the
# way back in the header.
# Reddens: comment-thread: "the header's back control returns to the comment list"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "          onClick={onBack}"
b = "          onClick={() => undefined}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the thread cannot be left.')
