# SOMEBODY ELSE'S JOB TITLE ASKS THE ROLE-CHANGE KEY, which a member granted the profile key lacks.
# Reddens: job-title-rule: "a member granted members.profile.manage sets a colleague’s job title (200) and it is saved"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (someoneElse && !(await this.roles.hasPermission(workspaceId, actorId, 'members.profile.manage'))) {\n"
b = "    if (someoneElse && !(await this.roles.hasPermission(workspaceId, actorId, 'members.role.change'))) {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('jtr-2-asks-the-wrong-key: done')
