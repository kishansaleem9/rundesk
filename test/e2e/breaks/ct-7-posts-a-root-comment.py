# THE FACADE THIS FRAME IS MOST LIKELY TO GET. A panel that looks exactly like
# the frame, takes the reply, shows it — and posts it as a ROOT comment. On
# screen the two are identical, because the panel is drawing a list it just
# refetched and the new comment is in it either way. Only parent_comment_id
# tells them apart, which is why the check reads Postgres.
# Reddens: comment-thread: "the reply is stored as a child of the comment the panel is about"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "        body: JSON.stringify({ body: body.trim(), parentCommentId: root.id }),"
b = "        body: JSON.stringify({ body: body.trim() }),"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the thread composer posts a root comment.')
