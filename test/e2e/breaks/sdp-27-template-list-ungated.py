# A LIST TEMPLATE AS IT WAS: applied into any project.
# Reddens: space-default-permission: "and a list template cannot be applied into a project in the view-only space either"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "      await assertCanPlaceIn(this.db, { spaceId: found.spaces.id, projectId: found.projects.id, actorId: userId, kind: 'list' })\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sdp-27-template-list-ungated: applied")
