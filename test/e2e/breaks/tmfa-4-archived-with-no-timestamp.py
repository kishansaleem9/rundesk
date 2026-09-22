# A task is flagged archived without `archivedAt` being stamped.
#
# The check it reddens says what the timestamp is for: "and stamped with when —
# which is what makes it restorable rather than gone." `archived-tasks` orders
# by it and the Archived list is how anybody finds a task again; a row flagged
# archived with a null timestamp is in the bin and not in the list, which is the
# one state worse than either.
#
# It is also the state the confirmation copy would then be lying about. The
# dialog promises "you can restore it from Archived tasks in workspace
# settings", and the promise is kept by a column nobody looks at twice —
# `isArchived: true` alone satisfies every boolean reader in the product and
# the page that offers the restore is the only one that needs the date.
#
# Three fields set together in one `.set({ … })` and this is the one that is not
# a flag or an actor, so it is the one that reads as bookkeeping.
#
# ONE CHECK. The task IS archived, so the check above it passes; the restore
# still works, so the check below it passes. Only the stamp is missing, which
# is why the suite asks about the stamp separately rather than trusting
# `is_archived`.
#
# Reddens: task-menu-favorite-archive: "and stamped with when — which is what makes it restorable rather than gone"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })"
if s.count(a) != 1:
    # The tasks service archives through its own call; find the task-scoped one.
    import re
    hits = [m.start() for m in re.finditer(re.escape('archivedAt: new Date()'), s)]
    raise AssertionError(f'anchor appears {s.count(a)} times in {p}; archivedAt occurrences: {len(hits)}')
b = "      .set({ isArchived: true, archivedById: actorId ?? null, updatedAt: new Date() })"
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: archiving no longer stamps archivedAt.')
