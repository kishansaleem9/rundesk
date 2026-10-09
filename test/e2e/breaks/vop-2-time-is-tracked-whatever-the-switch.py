# TIME IS TRACKED WHATEVER THE SWITCH: the time routes ask the read rule alone, as they did.
# (`found-25-sep/view-only-individual-permissions`)
# Reddens: view-only-permissions: "then the member is refused a time estimate, a timer and a logged entry in the switches’ words (403), and nothing of them is saved; puts the tag on and takes it off again, the second by the bulk editor; and makes a view of their own, while a view everybody shares is still refused for the level"
#   or "the API says what each may do there, by their own switches: the member no estimate and no time but tags and a view of their own, the guest the estimate and time but no tag and no view; neither may edit the task or add a shared view"
#   or "the member’s sheet offers no Start timer and no manual entry, and says their workspace has not allowed them to track time there; the estimate cannot be typed in; and a tag can be added"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (await viewOnlyMay(db, ctx.workspaceId, actorId, 'timeTracking')) return\n  throw new ForbiddenException(VIEW_ONLY_REFUSALS.timeTracking)\n",
     '  return // BROKEN: time is tracked whatever the switch\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('vop-2-time-is-tracked-whatever-the-switch: time is tracked whatever the switch')
