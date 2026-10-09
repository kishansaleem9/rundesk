# THE TASK'S ESTIMATE, TAGS AND TIME ARE WHAT EDIT IS: the sheet offers none of them to a person who only views.
# (`found-25-sep/view-only-individual-permissions`)
# Reddens: view-only-permissions: "the API says what each may do there, by their own switches: the member no estimate and no time but tags and a view of their own, the guest the estimate and time but no tag and no view; neither may edit the task or add a shared view"
#   or "and the member’s sheet follows: Start timer and a manual entry again, no word that they may not track time, an estimate to type, and no tag to add"
#   or "the member’s sheet offers no Start timer and no manual entry, and says their workspace has not allowed them to track time there; the estimate cannot be typed in; and a tag can be added"
#   or "and a timer the member starts from it runs, read back by SQL"
#
# Re-aimed 8 October: the last 2 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    return { edit, progress, comment, full, restore, estimate, tags, track }\n',
     '    return { edit, progress, comment, full, restore, estimate: edit || (estimate && false), tags: edit || (tags && false), track: edit || (track && false) } // BROKEN: the task says what edit says\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('vop-11-the-task-says-what-edit-says: the task says what edit says')
