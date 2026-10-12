# ONE’S OWN SEARCH CONNECTION IS WRITTEN AS THE WORKSPACE’S.
# (`found-23-sep/connected-search-per-person`)
# Reddens: connected-search: "a member connects their own Gmail: the consent comes back to search, and her own connection is kept — the workspace’s untouched (read by SQL)"
#   or "her mail is searched for her alone: she finds it, Max does not, and her source says it is her own"
#   or "Mia’s palette says her Gmail is her own and offers to disconnect it; disconnected, it is gone (read by SQL) and her mail is searched no more"
#
# Measured 12 October: the last 2 of these are knock-ons of the same edit, measured on lane 8 — checks that stand on what the first ones lost.
#
# The callback writes a personal search grant onto the workspace’s connection.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (payload.personal && PERSONAL_SEARCH_PROVIDERS.has(provider)) {\n      const row = {',
     '    if (payload.personal && PERSONAL_SEARCH_PROVIDERS.has(provider) && !provider) { // BROKEN\n      const row = {'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ccs-7-a-personal-grant-is-the-workspaces: ONE’S OWN SEARCH CONNECTION IS WRITTEN AS THE WORKSPACE’S.')
