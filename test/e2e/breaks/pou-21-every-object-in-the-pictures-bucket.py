# EVERY OBJECT GOES TO THE PICTURES' BUCKET (`found-30-sep/public-cdn-url-makes-every-object-public`):
# where `R2_PUBLIC_BUCKET_NAME` is set, a task's file is put in it too, so the domain on that bucket serves the
# file to anybody with its key — the exposure moved, not closed.
# Reddens: private-object-urls: "where the pictures have a bucket of their own, a task's file stays in the private bucket and is handed out signed — and read by its key at the public domain, as anybody once handed its URL could, it is not there"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '    return this.publicBucketName && isPublicImageKey(key) ? this.publicBucketName : this.bucketName!\n'
b = '    return this.publicBucketName ?? this.bucketName!\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-21-every-object-in-the-pictures-bucket: every object is in R2_PUBLIC_BUCKET_NAME')
