# THE CHECK NEVER SEES THE PRIVATE BUCKET SERVED (`found-30-sep/public-cdn-url-makes-every-object-public`):
# it reads its object back from the domain and calls the domain safe whatever came back.
# It reddens r2-public-bucket.test.ts "publicObjectUrl gives the public domain only where the pictures have a bucket of their own and the domain was seen not to serve the private one" as well.
# It reddens r2-public-bucket.test.ts "a later check that finds the private bucket served takes the domain away from the pictures" as well.
# Reddens: unit: r2-public-bucket.test.ts "checkPublicDomain puts an object among the private ones, reads it at the domain unsigned, and removes it: served back, the domain serves the private bucket"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = "      state = res.ok && body.trim() === token ? 'serves-private' : 'private-kept'\n"
b = "      state = res.ok && body.trim() === token && false ? 'serves-private' : 'private-kept'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-28-the-check-never-sees-the-private-bucket-unit: the check always finds the domain safe')
