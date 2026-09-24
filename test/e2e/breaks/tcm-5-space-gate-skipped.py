# THE SPACE'S CREATE GATE IS NOT ASKED: a view-only space takes new tasks, as it did.
# RE-AIMED 24 September: the gate passes a guest's chain (`within`) now; the patch
# still drops the whole call.
# Reddens: task-creation-access: "a member makes no task in a space whose default is “view only” or “comment” (403 each, none made) — in an “edit” space, one is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = """    await assertCanCreateInSpace(this.db, {
      spaceId: home.spaceId,
      actorId,
      kind: 'task',
      // What is shared of the way to it counts for a guest, as it does for a list (`WithinStep`).
      within: [
        { type: 'list', id: listId },
        { type: 'project', id: home.projectId },
        ...(home.folderId ? [{ type: 'folder' as const, id: home.folderId }] : []),
      ],
    })
    return home
"""
b = '    return home\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tcm-5-space-gate-skipped: applied")
