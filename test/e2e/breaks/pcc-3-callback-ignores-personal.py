# THE CALLBACK TAKES A PERSONAL GRANT FOR THE WORKSPACE'S: it writes the workspace's calendar connection.
# Reddens: unit: integration-connections.personal.test.ts "writes the person’s own account and nothing of the workspace’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (payload.personal) {\n'
b = "    if (payload.personal && payload.workspaceId === '') {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pcc-3-callback-ignores-personal: the callback ignores personal')
