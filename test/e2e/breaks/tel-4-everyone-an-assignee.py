# EVERYBODY IS TAKEN FOR AN ASSIGNEE: in a comment-only space, a colleague's task's status changes too.
# Reddens: task-edit-levels: "a comment-only space lets a member change nothing of a colleague's task, and on a task assigned to them its status alone"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.assertSpaceAllowsTaskWrite(ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee)\n    return ctx\n  }\n"
b = "    await this.assertSpaceAllowsTaskWrite(ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee || actorId !== '')\n    return ctx\n  }\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tel-4-everyone-an-assignee: everyone is an assignee')
