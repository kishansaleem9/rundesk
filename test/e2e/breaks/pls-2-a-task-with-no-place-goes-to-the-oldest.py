# A TASK WITH NO PLACE GOES TO THE OLDEST LIST, NOT THE PERSONAL LIST.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "a task made with no list chosen — /task — lands in her Personal List, and Home lists it, the list counting her two open tasks"
#   or "with no list chosen, /task lands in the person’s own Personal List, not the oldest list they can add to"
#   or "it is hers alone: Max, the guest and the workspace’s owner are each refused its task and its list by id, and search finds it for none of them — it does for her"
#   or "deleted, it is in her Trash, where it is named “Personal List” — and not in the owner’s, who cannot find it there to delete it for good (404)"
#   or "with the oldest list’s project deleted and no list chosen, /task lands in the Personal List as ever; a task made or moved straight into the deleted project’s list is refused — 409, saying its project is in the trash and what to do — and none lands there; the picker no longer offers it, offers the other project’s list, and offers no Personal List as a list of the hierarchy"
#   or "a list chosen in another workspace is not where this workspace’s tasks go: the person’s Personal List here is"
#   or "a chosen list the person may not add to is passed over, not refused: the task lands in their own Personal List — the member’s, not the admin’s"
#   or "and the picker it sends them to shows the deleted choice as a list in the trash, not “My Personal List” — which it shows in another workspace, where /task passes that list over — and choosing that saves it, so /task lands in the Personal List again"
#
# Re-aimed 9 October: the last 6 of these are knock-ons of the same edit, measured on lane 9 — checks that stand on what the first ones lost: two of `personal-list`, four of `planner-default-list`.
#
# /task with no list chosen passes the Personal List over for the oldest list the person can add to, as it did.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (personal) return personal.id\n',
     '    if (personal && personal.id === \'\') return personal.id // BROKEN: no Personal List asked\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-2-a-task-with-no-place-goes-to-the-oldest: A TASK WITH NO PLACE GOES TO THE OLDEST LIST, NOT THE PERSONAL LIST.')
