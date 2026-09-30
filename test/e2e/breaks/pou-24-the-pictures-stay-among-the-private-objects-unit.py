# THE PICTURES STAY AMONG THE PRIVATE OBJECTS (`found-30-sep/public-cdn-url-makes-every-object-public`):
# `R2_PUBLIC_BUCKET_NAME` is read and nothing is put in it: every picture is uploaded to, read from and signed
# for `R2_BUCKET_NAME`.
# It reddens r2-signed-urls.test.ts "publicObjectUrl signs a picture too where there is no public domain, or the domain is the raw R2 API host" as well.
# It reddens r2-public-bucket.test.ts "publicObjectUrl gives the public domain only where the pictures have a bucket of their own and the domain was seen not to serve the private one" as well.
# It reddens r2-public-bucket.test.ts "a later check that finds the private bucket served takes the domain away from the pictures" as well.
# It reddens r2-public-bucket.test.ts "a workspace’s logos are listed and deleted in both buckets, so one not yet moved is purged too" as well.
# It reddens r2-own-url.test.ts "and out of a signed URL of the pictures’ own bucket" as well.
# Reddens: unit: r2-public-bucket.test.ts "a picture is uploaded to, read from and signed for the pictures’ bucket; anything else, however it is spelt, stays in the private bucket"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '    return this.publicBucketName && isPublicImageKey(key) ? this.publicBucketName : this.bucketName!\n'
b = '    return this.bucketName!\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-24-the-pictures-stay-among-the-private-objects-unit: every object, pictures too, is in R2_BUCKET_NAME')
