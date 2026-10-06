# Every tile is drawn as if the provider list had answered "none of these":
# while it is on its way, each says Rundesk has no connector for it and offers
# Request access, Gmail's and SharePoint's too.
# Reddens: app-catalogue: "while the server has not said which apps it can
#          connect, no tile says Rundesk has no connector for it, Gmail and
#          SharePoint offer nothing to press yet, and the page says it is still
#          checking"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
a = "            supported={integration.id === 'slack' || providersQuery.isSuccess ? isSupportedIntegration(integration) : null}\n"
b = "            supported={isSupportedIntegration(integration)}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-integrations-page.tsx: the tiles answer before the server does.')
