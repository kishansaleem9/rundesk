# EVERY GUEST IS REFUSED A TASK BEFORE THEIR SHARES ARE READ, as they were.
# Re-aimed 6 October: the gate asks whether the list is in the trash before the space's level
# (`found-5-oct/default-list-files-into-an-archived-list`), and says what to do by the Trash’s rule.
# Reddens: guest-task-making: "a guest adds a task to a list shared with them at Full edit — and not at Edit (403), nor to a list not shared with them, none made"
#   or "given a whole space at Full edit, a guest adds a task in it"
#   or "the list page offers the guest Add task and the add rows in the list at Full edit, and neither in the one at Edit"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = '  if (home.inTrash && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))\n  await assertCanCreateInSpace(db, {\n'
b = "  if (home.inTrash && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, home.deletedById, actorId))\n  if (list.role === 'guest') throw new NotFoundException('Guests cannot create tasks')\n  await assertCanCreateInSpace(db, {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gtm-1-guests-refused-flat: applied')
