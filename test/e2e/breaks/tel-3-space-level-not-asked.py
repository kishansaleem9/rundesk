# A TASK'S CHANGE ASKS NOTHING OF ITS SPACE: comment-only and view-only spaces take every edit.
# Reddens: task-edit-levels: "a comment-only space lets a member change nothing of a colleague's task, and on a task assigned to them its status alone"
#   or "a view-only space lets a member change nothing, even on a task assigned to them"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.assertSpaceAllowsTaskWrite(ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee)\n    return ctx\n  }\n"
b = "    if (actorId === '') await this.assertSpaceAllowsTaskWrite(ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee)\n    return ctx\n  }\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tel-3-space-level-not-asked: the space level is not asked')
