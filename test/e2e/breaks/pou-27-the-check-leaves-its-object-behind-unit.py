# THE CHECK LEAVES ITS OBJECT BEHIND (`found-30-sep/public-cdn-url-makes-every-object-public`):
# every check, at boot and every hour, leaves one more object under `rundesk-probe/` in the private bucket.
# Reddens: unit: r2-public-bucket.test.ts "checkPublicDomain puts an object among the private ones, reads it at the domain unsigned, and removes it: served back, the domain serves the private bucket"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '      if (put) {\n        await this.client\n'
b = '      if (put && false) {\n        await this.client\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-27-the-check-leaves-its-object-behind-unit: the check does not delete its object')
