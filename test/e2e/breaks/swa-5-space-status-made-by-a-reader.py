# A SPACE'S STATUS IS MADE BY ANYONE WHO CAN READ THE SPACE: the guard is off its
# create route.
# Reddens: status-write-access: "a member of a view-only space makes no status on it, its project or its list (403, none made) — in an open space the same member makes one"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/scoped-statuses.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @UseGuards(StatusShapeGuard)\n  create(@Param('spaceId') spaceId: string, @Body() body: Body_) {\n"
b = "  create(@Param('spaceId') spaceId: string, @Body() body: Body_) {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('swa-5-space-status-made-by-a-reader: space create unguarded')
