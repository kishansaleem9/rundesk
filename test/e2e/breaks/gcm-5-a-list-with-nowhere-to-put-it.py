# THE CREATE MENU OFFERS A GUEST A LIST THOUGH THEY MAY ADD TO NO SPACE:
# the form then has nowhere to put it.
# RE-AIMED 25 September: the hook asks every person's writable spaces now (the view-only
# space's menus), and its guest branch was rewritten around that; the mistake is the same.
# Reddens: guest-create-menu: "a guest who may add to no space is offered a reminder and nothing else — a member is offered a task, a doc, a whiteboard and a list"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-creatable.ts'
a = "        if (type.guests === 'where-writable') return mayAddHere\n"
b = "        if (type.guests === 'where-writable') return spaceId ? mayAddHere : workspaceId !== undefined\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcm-5-a-list-with-nowhere-to-put-it: a list is offered with no space to add to')
