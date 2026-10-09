# THE LIBRARY'S RATE LIMIT IS SAID AS A LIBRARY THAT DID NOT ANSWER.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: unit: cover-photos.controller.test.ts "the library’s rate limit is said as too many searches (429), anything else as a library that did not answer (502)"
import io
p = '/home/user/rundesk/apps/api/src/modules/cover-photos/cover-photos.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (err instanceof PhotoLibraryFailed && (err.status === 403 || err.status === 429)) {\n',
     '  if (err instanceof PhotoLibraryFailed && err.status === 9999) { // BROKEN: the limit is a failure\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cph-8-a-rate-limit-is-a-failure-unit: THE LIBRARY'S RATE LIMIT IS SAID AS A LIBRARY THAT DID NOT ANSWER.")
