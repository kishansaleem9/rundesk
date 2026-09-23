# THE THREAD WITHOUT ITS COMMENT. Replies and a composer, and the thing they
# are about is one panel away — which is the split this panel exists to close.
# Reddens: comment-thread: "the comment itself is in the panel"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "        <MentionText markdown text={root.body} namesById={namesById} className=\"mt-1 text-sm\" />"
b = "        {null}"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the thread no longer shows the comment it is about.')
