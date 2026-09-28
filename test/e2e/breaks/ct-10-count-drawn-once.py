# A COUNT THAT IS RENDERED ONCE AND NEVER RECOMPUTED — the facade this audit
# names first, in its smallest form. The reply is written in the thread, stored
# with the right parent, drawn in the panel, and the list beside it still says
# one, for ever.
# Reddens: comment-thread: "and the list counts the reply that was written in the thread"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                    <span className=\"text-xs text-accent ml-auto\">{tCount('taskDetail.repliesCount', replies.length)}</span>"
b = "                    <span className=\"text-xs text-accent ml-auto\">{tCount('taskDetail.repliesCount', 1)}</span>"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the replies count is drawn once and never recomputed.")
