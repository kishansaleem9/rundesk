# A GUEST COPIES ANYBODY'S CLIP ONTO A TASK SHARED WITH THEM (`found-5-oct/guests-read-and-delete-every-clip`).
#
# A task's copy of a clip reads every caller as a member: a guest holding the
# admin's key copies the admin's clip onto a task shared with them to edit, and
# downloads it there, signed for whoever reads the task.
#
# Reddens: clip-library-access: "a guest may not link, share or copy onto a task somebody else’s clip — refused, saying which clips are theirs, and nothing is made; their own they attach, and its public link is refused as a guest’s (section 11)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (!mayReadClip(head.Metadata, await clipReaderOf(this.db, ctx.workspaceId, actorId))) {\n'
b = "    if (!mayReadClip(head.Metadata, { ...(await clipReaderOf(this.db, ctx.workspaceId, actorId)), role: 'member' })) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-22-a-guest-copies-anybodys-clip-onto-a-task: a guest copies any clip onto a task')
