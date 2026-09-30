# THE API STARTS BEFORE ITS DOMAIN IS CHECKED (`found-30-sep/public-cdn-url-makes-every-object-public`):
# the boot does not wait for the check, so the first requests are answered before anybody knows what the
# domain serves.
# Reddens: unit: r2-public-bucket.test.ts "the domain is checked when the API starts, before its first request, and again every hour; the pictures are moved after"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '    await this.checkPublicDomain()\n    void this.movePicturesToPublicBucket()'
b = '    void this.checkPublicDomain()\n    void this.movePicturesToPublicBucket()'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-31-the-api-starts-before-its-domain-is-checked-unit: the boot does not wait for the check')
