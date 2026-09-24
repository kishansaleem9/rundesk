# A REMINDER IS WITHHELD FROM A GUEST, though it is their own and the API
# makes it: the guest's menus offer nothing at all.
# Reddens: guest-create-menu: "a guest who may add to no space is offered a reminder and nothing else — a member is offered a task, a doc, a whiteboard and a list"
#   or "on a space a guest only passes through, its own menu offers them no list, task, Imports or Templates — a member’s offers all four"
import io
p = '/home/user/rundesk/apps/web/src/lib/create-types.ts'
a = "blurbKey: 'createMenu.blurbReminder', inSpace: true, scopedToSpace: false, isContainer: false, guests: 'yes' },\n"
b = "blurbKey: 'createMenu.blurbReminder', inSpace: true, scopedToSpace: false, isContainer: false, guests: 'no' },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcm-3-reminder-withheld: the reminder row says no to guests')
