# THE PICTURES STAY AMONG THE PRIVATE OBJECTS (`found-30-sep/public-cdn-url-makes-every-object-public`):
# `R2_PUBLIC_BUCKET_NAME` is read and nothing is put in it: an avatar or a logo uploaded now goes to
# `R2_BUCKET_NAME`, where a domain on the pictures' bucket cannot serve it, and is signed from there.
# It reddens 2 checks, each named below.
# Reddens: private-object-urls: "an avatar and a workspace logo uploaded now go to the pictures' bucket, and their saved address sends a viewer to the public domain, unsigned, which serves them — public by design"
#   "where the pictures have a bucket of their own but the domain was left on the private one, the API sees it when it starts and sends nobody there: a picture's address is signed, from the pictures' bucket, and still loads"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '    return this.publicBucketName && isPublicImageKey(key) ? this.publicBucketName : this.bucketName!\n'
b = '    return this.bucketName!\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-16-the-pictures-stay-among-the-private-objects: every object, pictures too, is in R2_BUCKET_NAME')
