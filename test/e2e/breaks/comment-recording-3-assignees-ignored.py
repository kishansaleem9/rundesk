# Being assigned to a private task stops granting access in the picker's view,
# so the warning stays up for somebody the task really does open for. The
# picker and the product disagree, and one of the two is lying to somebody.
#
# Reddens: comment-recording: "assigning them to it takes the warning away"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      assigneeIds: new Set(assigneeRows.map((a) => a.userId)),\n'
b = '      assigneeIds: new Set<string>(),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: assignees no longer count as having access in the mention picker.')
