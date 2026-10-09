# THE PICKERS OF LISTS OFFER A PERSONAL LIST AS A LIST OF THE HIERARCHY.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "it is no place in the hierarchy: the sidebar’s spaces, search, the calendar sync’s places and the pickers of lists leave its space out, and getting started counts no space or project more once a Personal List is made"
#   or "with the oldest list’s project deleted and no list chosen, /task lands in the Personal List as ever; a task made or moved straight into the deleted project’s list is refused — 409, saying its project is in the trash and what to do — and none lands there; the picker no longer offers it, offers the other project’s list, and offers no Personal List as a list of the hierarchy"
#
# The planner’s Default list picker offers it beside the empty choice that already means it.
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('eq(lists.isArchived, false), isNull(lists.personalOf), holdersNotInTrash(), visFilter))',
     'eq(lists.isArchived, false), holdersNotInTrash(), visFilter)) // BROKEN'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-10-the-list-pickers-offer-it: THE PICKERS OF LISTS OFFER A PERSONAL LIST AS A LIST OF THE HIERARCHY.')
