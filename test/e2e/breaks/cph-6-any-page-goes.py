# ANY PAGE IS ASKED OF THE LIBRARY.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "the library is searched for the workspace’s own members; a blank search, a page past fifty, and a photo the library does not hold are refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/cover-photos/cover-photos.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!Number.isInteger(n) || n < 1 || n > 50) throw new BadRequestException(',
     '    if (!Number.isInteger(n) || n < 1 || n > 5000) throw new BadRequestException('),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-6-any-page-goes: any page goes')
