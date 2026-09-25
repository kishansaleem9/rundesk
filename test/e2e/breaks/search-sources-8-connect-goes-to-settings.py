# THE PALETTE'S CONNECT GOES TO SETTINGS AGAIN, which connects no source.
# Reddens: search-sources: "and that way is the App Center, at the source’s own app"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
s = io.open(p, encoding='utf-8').read()
a = "              navigate({ to: '/app/$workspaceId/integrations', params: { workspaceId: workspaceId! }, search: { app: activeSource.provider! } })\n"
b = "              navigate({ to: '/app/$workspaceId/settings', params: { workspaceId: workspaceId! } })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('search-sources-8-connect-goes-to-settings: Connect goes to Settings')
