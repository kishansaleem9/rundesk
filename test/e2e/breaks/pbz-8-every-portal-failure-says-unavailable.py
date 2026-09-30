# EVERY PORTAL FAILURE SAYS THE PORTAL IS UNAVAILABLE, as it did. (`found-30-sep/public-pages-read-429-as-gone`)
#
# Reddens: public-pages-busy: "a portal that failed to load for another reason says it could not be loaded, not that it is unavailable"
import io
p = '/home/user/rundesk/apps/web/src/routes/portal.$token.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    const gone = portalQuery.error instanceof ApiError && portalQuery.error.status === 404\n'
b = '    const gone = portalQuery.error instanceof ApiError || true\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pbz-8-every-portal-failure-says-unavailable: every failure says unavailable')
