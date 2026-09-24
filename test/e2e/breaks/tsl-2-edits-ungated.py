# A TASK EDIT ASKS NOTHING OF THE SPACE, as it did: an assignee changes status in "view only".
# Reddens: task-space-levels: "nor change the status of a task assigned to them (403, unchanged) — in an “edit” space they do"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertSpaceAllowsTaskWrite(ctx.spaceId, actorId, opts.level ?? 'edit', !!assignee)\n    return ctx\n"
b = '    return ctx\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tsl-2-edits-ungated: applied")
