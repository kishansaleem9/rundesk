# NO WAY IN. The panel exists and nothing on a comment opens it — the frame's
# thread is reachable from the comment it is about or it is reachable from
# nowhere, and a panel nobody can get to is a component, not a feature.
# Reddens: comment-thread: "a root comment offers a way into its thread"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                    data-testid={`comment-thread-open-${c.id}`}"
b = "                    data-testid={`comment-thread-open-none-${c.id}`}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the thread panel is unreachable from any comment.')
