# A PERSONAL GRANT THAT FAILS IS WRITTEN ONTO THE WORKSPACE'S CARD, and the person is sent to the App Center.
# Reddens: personal-calendar-connect: "a personal grant that fails lands on the planner’s Accounts page saying why, and writes nothing onto the workspace’s calendar card — the admin’s lands on the App Center, on its card"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = '      if (ctx?.personal) {\n'
b = "      if (ctx?.personal && ctx.workspaceId === '') {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pcc-4-failure-on-the-workspace-card: a personal failure goes on the workspace card')
