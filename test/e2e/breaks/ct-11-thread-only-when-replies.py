# THE CONTROL HUNG OFF THE REPLIES COUNT, which is the obvious design and
# loses exactly one case: the first reply. A comment nobody has answered has
# no count, so it gets no thread, so the composer the frame draws is reachable
# only on comments that did not need it.
# Reddens: comment-thread: "a comment with no replies opens a thread of its own"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                  <button\n                    type=\"button\"\n                    data-testid={`comment-thread-open-${c.id}`}"
b = "                  {replies.length > 0 && <button\n                    type=\"button\"\n                    data-testid={`comment-thread-open-${c.id}`}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
c = "                    {t('taskDetail.thread')}\n                  </button>"
d = "                    {t('taskDetail.thread')}\n                  </button>}"
assert s.count(c) == 1, f'closing anchor appears {s.count(c)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b).replace(c, d))
print('task-detail-sheet.tsx: only an already-answered comment can open a thread.')
