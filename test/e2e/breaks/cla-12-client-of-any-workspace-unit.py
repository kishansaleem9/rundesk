# A PROJECT TAKES ANY WORKSPACE'S CLIENT, AS IT DID: whoever changes the project, the clientId goes in unchecked.
# Reddens: unit: projects.service.test.ts "refuses a client that is not one of the project's workspace's clients (400), and writes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/projects/projects.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (data.clientId !== undefined && data.clientId !== null) {\n      await this.assertClientOfWorkspace(projectId, data.clientId, managed?.workspaceId)\n    }\n'
b = '    if (data.clientId !== undefined && data.clientId !== null && !actorId) {\n      await this.assertClientOfWorkspace(projectId, data.clientId, managed?.workspaceId)\n    }\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cla-12-client-of-any-workspace-unit: the clientId is checked for nobody who acts')
