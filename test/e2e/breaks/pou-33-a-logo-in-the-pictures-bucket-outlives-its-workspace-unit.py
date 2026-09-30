# A LOGO IN THE PICTURES' BUCKET OUTLIVES ITS WORKSPACE (`found-30-sep/public-cdn-url-makes-every-object-public`):
# a listing under a picture prefix reads the private bucket alone, so a workspace deleted for good leaves every
# logo it uploaded where the public domain serves it.
# Reddens: unit: r2-public-bucket.test.ts "a workspace’s logos are listed and deleted in both buckets, so one not yet moved is purged too"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '    return this.publicBucketName && isUnderPublicImagePrefix(prefix) ? [this.publicBucketName, this.bucketName!] : [this.bucketName!]\n'
b = '    return [this.bucketName!]\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-33-a-logo-in-the-pictures-bucket-outlives-its-workspace-unit: a picture prefix is listed in the private bucket alone')
