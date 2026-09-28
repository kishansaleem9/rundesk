# ANYBODY SETS ANYBODY'S JOB TITLE: the permission is not asked.
# Reddens: job-title-rule: "a plain member is refused a colleague’s job title (403), the refusal names the permission it takes rather than saying only an admin may, and the title stays"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (someoneElse && !(await this.roles.hasPermission(workspaceId, actorId, 'members.profile.manage'))) {\n"
b = '    if (someoneElse && Boolean(0)) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('jtr-1-anybody-retitles-anybody: done')
