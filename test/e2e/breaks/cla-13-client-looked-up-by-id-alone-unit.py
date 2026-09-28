# THE PROJECT'S CLIENT IS LOOKED UP BY ITS ID ALONE: another workspace's client passes.
# Reddens: unit: projects.service.test.ts "looks the client up among the project's workspace's clients only, then sets it"
import io
p = '/home/user/rundesk/apps/api/src/modules/projects/projects.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, ws)))\n'
b = '      .where(and(eq(clients.id, clientId), ws ? undefined : undefined))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cla-13-client-looked-up-by-id-alone-unit: the client lookup asks no workspace')
