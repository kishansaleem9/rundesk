# Box goes back to being an app the frame draws and this page does not have.
# Reddens: app-catalogue: "and each of Box, Confluence, Jira, Gmail, SharePoint
#          and Outlook Mail has a tile"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
a = "  { id: 'box', name: 'Box', descKey: 'integrations.desc.box', category: 'storage', brandColor: '#0061D5', logo: 'B' },\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-integrations-page.tsx: the Box tile is gone again.')
