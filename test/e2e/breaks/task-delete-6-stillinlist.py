# Check 6 — the deleted task leaves the list while the untouched one stays.
#
# The first version of this patch removed only the `isArchived` filter and the
# check still passed, because a later fix added `isNull(deletedAt)` BESIDE it:
# two independent conditions hide a binned task, so removing one proves
# nothing. That is the code being more robust than the patch assumed, not the
# check being weak — but a break patch that cannot break anything is exactly
# what this step exists to catch, so it now removes both.
#
# Reddens: task-delete: "the deleted task leaves the list and the untouched one stays"
import io, sys
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "        includeArchived ? undefined : eq(tasks.isArchived, false),\n        isNull(tasks.deletedAt),\n"
if s.count(a) != 1:
    sys.exit('anchor %d times' % s.count(a))
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "        undefined,\n"))
print('BROKE check 6: GET /tasks/list/:id hides neither archived nor binned tasks')
