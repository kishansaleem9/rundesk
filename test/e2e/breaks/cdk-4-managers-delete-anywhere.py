# A MANAGER DELETES PROJECTS AND LISTS IN SPACES THEY DO NOT BELONG TO: the own-space refusal is gone.
# Reddens: container-delete-keys: "a manager, who holds project.delete and list.delete by default, deletes a list and a project in a space they belong to — and in one they do not is refused both (403), which stay"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
s = io.open(p, encoding='utf-8').read()
a = '      if (!member) throw new ForbiddenException(`Managers can only delete ${params.kind}s in their own spaces`)\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cdk-4-managers-delete-anywhere: the manager own-space refusal is gone')
