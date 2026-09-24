# NO CALENDAR IS OFFERED EVEN WHERE THE SERVER CAN CONNECT IT: the gate reads every answer as "no".
# Reddens: planner-gates: "where the server can connect it, Google Calendar is offered and starts the connection"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '    providerStatus === undefined ? null : (providerStatus.find((p) => p.provider === provider)?.available ?? false)\n'
b = '    providerStatus === undefined ? null : false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pgt-4-nothing-offered: applied")
