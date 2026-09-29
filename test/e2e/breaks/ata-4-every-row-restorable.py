# EVERY ARCHIVED ROW SAYS ITS READER MAY RESTORE IT: the view-only space's task offers the member a Restore the route refuses.
# Re-aimed 29 September: the rule is asked per row only for a member or guest now; an admin's and a manager's answers are batched (`archived-tasks-unarchived-in-place`).
# Reddens: archived-tasks-access: "each archived row says whether its reader may restore it: the member the open space’s and not the view-only one’s, the admin all three, the manager none (they belong to none of these spaces)"
#   or "on the member’s Archived tab the view-only space’s task is listed without Restore and marked view only, and no Archived workspaces card is offered to restore from"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    return Promise.all(rows.map((row) => taskRestorable(this.db, row.id, actorId)))\n'
b = '    return rows.map(() => true)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ata-4-every-row-restorable: every archived row says canRestore')
