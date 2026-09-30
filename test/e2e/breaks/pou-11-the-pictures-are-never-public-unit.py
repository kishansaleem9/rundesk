# THE PICTURES ON SHOW ARE NEVER SERVED FROM THE PUBLIC DOMAIN (`found-30-sep/public-cdn-url-makes-every-object-public`):
# `publicObjectUrl` signs an avatar and a logo like any private object, even where they have a bucket of their own
# and the domain is on it alone, so a deployment's CDN serves none of them.
# It reddens r2-public-bucket.test.ts "publicObjectUrl gives the public domain only where the pictures have a bucket of their own and the domain was seen not to serve the private one" as well.
# It reddens r2-public-bucket.test.ts "a later check that finds the private bucket served takes the domain away from the pictures" as well.
# It reddens r2-own-url.test.ts "and out of a public-CDN URL" as well.
# Reddens: unit: r2-signed-urls.test.ts "publicObjectUrl serves an avatar and a workspace logo from the public domain, unsigned"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = "    if (base && this.publicBucketName && this.publicDomain === 'private-kept' && isPublicImageKey(key)) {\n"
b = "    if (base && this.publicBucketName && this.publicDomain === 'private-kept' && isPublicImageKey(key) && false) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-11-the-pictures-are-never-public-unit: publicObjectUrl always signs')
