# A PICTURE'S SIGNED URL IS NOT READ BACK AS OURS (`found-30-sep/public-cdn-url-makes-every-object-public`):
# `keyFromOwnUrl` knows only the private bucket's path, so a signed URL of the pictures' bucket sent back is
# taken for somebody else's link and stored as one.
# Reddens: unit: r2-own-url.test.ts "and out of a signed URL of the pictures’ own bucket"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '      for (const bucket of [this.bucketName, this.publicBucketName]) {\n'
b = '      for (const bucket of [this.bucketName]) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-34-a-picture-s-signed-url-is-not-read-back-unit: keyFromOwnUrl reads the private bucket alone')
