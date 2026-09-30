# THE PORTAL NEVER SHOWS THE BUSY PANEL: a refusal falls through to an error page. (`found-30-sep/public-pages-read-429-as-gone`)
#
# Reddens: public-pages-busy: "a portal refused for too many requests says so, and when it will try again, not that the portal is unavailable"
import io
p = '/home/user/rundesk/apps/web/src/routes/portal.$token.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  if (busyFor !== null) {\n    return <PublicBusy seconds={busyLeft ?? busyFor} onRetry={() => void portalQuery.refetch()} testId="client-portal-busy" />\n'
b = '  if (busyFor === -1) {\n    return <PublicBusy seconds={busyLeft ?? busyFor} onRetry={() => void portalQuery.refetch()} testId="client-portal-busy" />\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pbz-6-the-portal-is-busy-for-nobody: the portal is busy for nobody')
