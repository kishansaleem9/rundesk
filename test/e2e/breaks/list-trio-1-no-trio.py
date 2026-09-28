# Leave the slot empty on the List view — which is what it was before frame
# `11:00` was read: the board's three correctly absent, and nothing in their
# place. The "board switches are not here" check passes on exactly this.
# Reddens: list-customize: "the List view carries its own trio there — task locations, subtask parent names, closed tasks"
import io
p = "/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx"
a = "        {isList && (\n"
b = "        {isBoard && isList && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('the List view draws no trio — the slot frame 11:00 fills is empty again.')
