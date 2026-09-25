# A LIST'S STATUS IS MADE BY ANYONE WHO CAN READ THE LIST: the guard is off its
# create route.
# Reddens: status-write-access: "a member of a view-only space makes no status on it, its project or its list (403, none made) — in an open space the same member makes one"
#   or "a guest given a list, or a whole space, to edit still shapes none of their statuses (403, none made) — a member makes one there"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/list-statuses.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @UseGuards(StatusShapeGuard)\n  create(\n    @Param('listId') listId: string,\n"
b = "  create(\n    @Param('listId') listId: string,\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('swa-6-list-status-made-by-a-reader: list create unguarded')
