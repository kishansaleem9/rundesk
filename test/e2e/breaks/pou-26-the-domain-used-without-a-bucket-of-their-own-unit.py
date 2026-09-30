# THE DOMAIN IS USED FOR PICTURES THAT SHARE THE PRIVATE BUCKET (`found-30-sep/public-cdn-url-makes-every-object-public`):
# where the check found the domain keeps the private objects (a rule on it, say) but the pictures have no bucket
# of their own, `publicObjectUrl` sends a viewer there, and the domain is one rule away from serving everything.
# Reddens: unit: r2-public-bucket.test.ts "publicObjectUrl gives the public domain only where the pictures have a bucket of their own and the domain was seen not to serve the private one"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = "    if (base && this.publicBucketName && this.publicDomain === 'private-kept' && isPublicImageKey(key)) {\n"
b = "    if (base && this.publicDomain === 'private-kept' && isPublicImageKey(key)) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-26-the-domain-used-without-a-bucket-of-their-own-unit: publicObjectUrl does not ask for a bucket of their own')
