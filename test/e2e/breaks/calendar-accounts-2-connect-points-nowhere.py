# `oauth/start` keeps answering 201 and stops handing back a usable consent URL. The Zoom
# Connect row on the planner's Accounts page goes on looking exactly the same and sends
# nobody anywhere - the facade: a control that can only ever say it worked. Frame `13:36`.
# Reddens: calendar-accounts: "starts at Zoom's own consent endpoint or refuses because Zoom is not configured — "
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
a = '    return { authUrl: `${cfg.authUrl}?${params.toString()}` }'
b = "    return { authUrl: '' }"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('integration-connections.service.ts: oauth/start answers 201 with no consent URL.')
