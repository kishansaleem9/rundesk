# A PROJECT'S STATUS IS MADE BY ANYONE WHO CAN READ THE PROJECT: the guard is off
# its create route.
# Reddens: status-write-access: "a guest who passes through a project makes, renames, deletes and reorders none of its statuses (refused, all unchanged) — the admin makes one"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/scoped-statuses.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @UseGuards(StatusShapeGuard)\n  create(@Param('projectId') projectId: string, @Body() body: Body_) {\n"
b = "  create(@Param('projectId') projectId: string, @Body() body: Body_) {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('swa-3-project-status-made-by-a-reader: project create unguarded')
