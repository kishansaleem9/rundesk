# A SPACE'S OWN "+" OFFERS A GUEST A LIST IN ANY SPACE AGAIN, writable or
# not — a 403 in a space they only pass through.
# RE-AIMED 25 September: the hook asks every person's writable spaces now (the view-only
# space's menus), and its guest branch was rewritten around that; the mistake is the same.
# Reddens: guest-create-menu: "on a space a guest only passes through, its own menu offers them no list, task, Imports or Templates — a member’s offers all four"
#   or "given a space with Full edit, a guest is offered a list — in the Create menu and on that space’s menu, not on the space they pass through — and still no task"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-creatable.ts'
a = "        if (type.guests === 'where-writable') return mayAddHere\n"
b = "        if (type.guests === 'where-writable') return spaceId ? spaceId !== '' : mayAddHere\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcm-4-a-list-in-any-space: a list is offered in every space')
