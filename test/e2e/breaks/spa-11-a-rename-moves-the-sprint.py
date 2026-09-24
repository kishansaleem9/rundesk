# A RENAME SPREADS ITS WHOLE BODY INTO THE ROW AGAIN: `spaceId` and `workspaceId` move the sprint.
# Reddens: sprint-access: "a rename changes the name, and moves the sprint neither into a private space nor to another workspace"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.controller.ts'
a = '      {\n        name: body.name,\n        goal: body.goal,\n        status: body.status,\n        startDate: body.startDate ? new Date(body.startDate) : undefined,\n        endDate: body.endDate ? new Date(body.endDate) : undefined,\n      },\n'
b = '      {\n        ...body,\n        startDate: body.startDate ? new Date(body.startDate) : undefined,\n        endDate: body.endDate ? new Date(body.endDate) : undefined,\n      },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("spa-11-a-rename-moves-the-sprint: applied")
