# Check 9 — THE ANTI-FACADE CHECK. Put the Trash back on `is_archived`, which
# is exactly the state this row existed to split: archiving a task would once
# again drop it in the bin with a thirty-day clock on it.
#
# Reddens: task-delete: "the archived task is sitting in the Trash: Archive and Delete are still one state under two names"
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "        .where(and(eq(spaces.workspaceId, workspaceId), isNotNull(tasks.deletedAt), personalListOpenTo(actor.id)))"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(
    s.replace(a, "        .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, true), personalListOpenTo(actor.id)))")
)
print('BROKE check 9: the Trash lists tasks by is_archived again, so archived tasks are binned')
