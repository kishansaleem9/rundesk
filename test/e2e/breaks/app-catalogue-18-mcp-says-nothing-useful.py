# The panel drops the reason and says something soothing instead. A limit a
# person cannot read is a limit they will walk into.
# Reddens: app-catalogue: "it opens, and says plainly what the AI cannot do yet"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
a = "              <span>{t('integrations.mcpNotYet')}</span>\n"
b = "              <span>{t('integrations.mcpSubtitle')}</span>\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-integrations-page.tsx: the MCP panel repeats the pitch instead of the limit.')
