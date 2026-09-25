# A GUEST'S CHANGE SKIPS THE READ RULE, SO A TASK SHARED WITH NOBODY ANSWERS AS IF IT WERE THEIRS TO ASK ABOUT.
# Reddens: guest-task-edits: "the task beside them, shared with nobody, is not theirs (not found, unchanged; its capabilities refused); and the API answers each shared task by its share: nothing, comments, the status on theirs, every change — and at Edit no delete, which takes Full edit"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (!(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: membership.role }))) {\n'
b = "  if (membership.role !== 'guest' && !(await readableTask(db, ctx.workspaceId, taskId, { id: actorId, role: membership.role }))) {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("gte-2-guests-skip-the-read-rule: a guest's change skips the read rule, so a task shared with nobody answers as if it were theirs to ask about")
