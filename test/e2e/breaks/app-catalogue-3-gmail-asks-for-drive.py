# The Google fallthrough this file used to have: a mail connection consented at
# the DRIVE scope. It connects, it stores a token, and every inbox search comes
# back empty — blaming the mailbox for a consent nobody asked for.
# Reddens: app-catalogue: "pressing Connect on Gmail asks Google for the mailbox itself"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
a = "      gmail: GMAIL_SEARCH_SCOPE,\n"
b = "      gmail: DRIVE_SEARCH_SCOPE,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('integration-connections.service.ts: Gmail consents at the Drive scope.')
