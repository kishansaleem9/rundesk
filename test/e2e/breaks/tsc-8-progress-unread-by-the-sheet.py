# THE SHEET ASKS "EDIT" OF THE STATUS: an assignee in a comment-only space cannot move theirs.
# Reddens: task-sheet-capabilities: "on a task assigned to them there it offers the status too — and moving it on saves — and still no other change"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              disabled={patchTask.isPending || !nextStatus || !(caps.edit || caps.progress)}\n'
b = '              disabled={patchTask.isPending || !nextStatus || !caps.edit}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tsc-8-progress-unread-by-the-sheet: the sheet asks edit of the status')
