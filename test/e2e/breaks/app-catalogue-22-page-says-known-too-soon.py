# The page says it knows which apps can be connected before the provider list
# has answered, so whatever waits on it reads tiles nobody answered for.
# Reddens: app-catalogue: "while the server has not said which apps it can
#          connect, no tile says Rundesk has no connector for it, Gmail and
#          SharePoint offer nothing to press yet, and the page says it is still
#          checking"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
a = "    : providersQuery.isSuccess && mayConnect !== null && !providerStatusQuery.isPending && !connectionsQuery.isPending\n"
b = "    : mayConnect !== null && !providerStatusQuery.isPending && !connectionsQuery.isPending\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-integrations-page.tsx: the page says known before the provider list answers.')
