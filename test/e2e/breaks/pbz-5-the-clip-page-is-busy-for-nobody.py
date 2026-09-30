# THE CLIP PAGE NEVER SHOWS THE BUSY PANEL: a refusal falls through to "not available". (`found-30-sep/public-pages-read-429-as-gone`)
#
# Reddens: public-pages-busy: "a clip’s link refused for too many requests says so, and when it will try again, not that the clip is not available"
import io
p = '/home/user/rundesk/apps/web/src/pages/clip-link-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  if (busyFor !== null) {\n    return <PublicBusy seconds={busyLeft ?? busyFor} onRetry={() => void view.refetch()} testId="clip-link-busy" />\n'
b = '  if (busyFor === -1) {\n    return <PublicBusy seconds={busyLeft ?? busyFor} onRetry={() => void view.refetch()} testId="clip-link-busy" />\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pbz-5-the-clip-page-is-busy-for-nobody: the clip page is busy for nobody')
