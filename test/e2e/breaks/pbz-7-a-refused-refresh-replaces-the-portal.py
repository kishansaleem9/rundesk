# A REFUSED REFRESH REPLACES THE PORTAL WITH AN ERROR PAGE, as it did. (`found-30-sep/public-pages-read-429-as-gone`)
#
# The portal asks again every 45 seconds; one refusal wiped the page.
#
# Reddens: public-pages-busy: "a portal already drawn stays drawn when a later ask is refused"
import io
p = '/home/user/rundesk/apps/web/src/routes/portal.$token.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  if (!portalQuery.data) {\n    const gone = portalQuery.error instanceof ApiError && portalQuery.error.status === 404\n'
b = '  if (portalQuery.isError || !portalQuery.data) {\n    const gone = portalQuery.error instanceof ApiError && portalQuery.error.status === 404\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pbz-7-a-refused-refresh-replaces-the-portal: a refused refresh wipes the portal')
