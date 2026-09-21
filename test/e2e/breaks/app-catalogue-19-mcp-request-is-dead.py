# The banner becomes the chevron to nowhere it was drawn as: it opens, it has a
# button, and the button does nothing at all.
# Reddens: app-catalogue: "and its one action records the ask, so the banner is
#          not a chevron to nowhere"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
a = "                onClick={() => requestAccess.mutate(CUSTOM_MCP_PROVIDER)}\n"
b = "                onClick={() => setMcpOpen(false)}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-integrations-page.tsx: the MCP request button just closes the panel.')
