# THE SWITCHES ARE NEVER READ: whatever an admin sets, a person who only views gets ClickUp's defaults.
# (`found-25-sep/view-only-individual-permissions`)
# Reddens: view-only-permissions: "then the member is refused a time estimate, a timer and a logged entry in the switches’ words (403), and nothing of them is saved; puts the tag on and takes it off again, the second by the bulk editor; and makes a view of their own, while a view everybody shares is still refused for the level"
#   or "the API says what each may do there, by their own switches: the member no estimate and no time but tags and a view of their own, the guest the estimate and time but no tag and no view; neither may edit the task or add a shared view"
#   or "the member’s sheet offers no Start timer and no manual entry, and says their workspace has not allowed them to track time there; the estimate cannot be typed in; and a tag can be added"
#   or "the member’s list page offers + View, and pressing it makes a view of their own (private), which their level allows where a shared one it does not"
#
# Re-aimed 8 October: the last 2 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/view-only.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  return row ? viewOnlyPermissionsOf(row)[permission] : false\n',
     '  return row ? VIEW_ONLY_DEFAULTS[permission] : false // BROKEN: the switches are never read\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('vop-1-the-switches-are-never-read: the switches are never read')
