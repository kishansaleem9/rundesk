# CREATETASK ASKS ONLY WHETHER THE MAKER IS A GUEST, as it did: every other rule was the route's.
# Re-aimed 25 September: the guest-only check it restored was removed as dead (`guests-with-full-edit-make-no-tasks`), so the patch no longer built; createTask asks nothing now, which leaves every rule to the route as before.
# Reddens: task-creation-access: "a member makes no task from a message in a list they may not open (not found, none made) — in the open list, one is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    await this.assertCanCreateTaskIn(data.listId, data.createdById)\n'
b = '    void this.assertCanCreateTaskIn\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tcm-1-only-guests-asked: applied")
