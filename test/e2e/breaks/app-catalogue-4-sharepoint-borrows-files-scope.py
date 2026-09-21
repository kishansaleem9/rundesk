# SharePoint asks Microsoft for OneDrive's grant. `Files.ReadWrite` reaches the
# signed-in user's own drive and no SharePoint site, so the connection succeeds
# and the search is permanently empty.
# Reddens: app-catalogue: "and SharePoint asks Microsoft for Sites.Read.All, not
#          OneDrive's file scope"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
a = "        sharepoint: SHAREPOINT_SEARCH_SCOPE,\n"
b = "        sharepoint: 'Files.ReadWrite',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('integration-connections.service.ts: SharePoint consents at the OneDrive file scope.')
