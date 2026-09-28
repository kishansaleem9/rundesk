# A GUEST IS OFFERED WHAT A MEMBER IS AGAIN: the hook answers every guest
# as it answers a member, so the menus offer tasks, docs, whiteboards and
# lists that the API refuses them.
# RE-AIMED 25 September: the hook asks every person's writable spaces now (the view-only
# space's menus), and its guest branch was rewritten around that; the mistake is the same.
# Reddens: guest-create-menu: "a guest who may add to no space is offered a reminder and nothing else — a member is offered a task, a doc, a whiteboard and a list"
#   or "on a space a guest only passes through, its own menu offers them no list, task, Imports or Templates — a member’s offers all four"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-creatable.ts'
a = '      if (guest) {\n'
b = "      if (guest && workspaceId === '') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcm-1-guests-offered-everything: every guest is answered as a member')
