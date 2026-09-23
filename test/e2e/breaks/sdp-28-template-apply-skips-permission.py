# TEMPLATE APPLY AS IT WAS: a folder template makes a project with no project.create
# check — the templates page as a way round a permission members do not hold.
# Reddens: space-default-permission: "a member without project.create cannot make a folder by applying a template either — the templates page was a way round the permission"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    if (targetType === 'folder') await this.assertMayMake(workspaceId, userId, globalRole, 'project.create')\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sdp-28-template-apply-skips-permission: applied")
