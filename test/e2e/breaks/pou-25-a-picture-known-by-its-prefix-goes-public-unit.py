# A KEY IS PUT WHERE THE DOMAIN SERVES IT BY ITS PREFIX ALONE (`found-30-sep/public-cdn-url-makes-every-object-public`):
# `avatars/../workspaces/<ws>/tasks/<task>/attachments/<file>` and `avatars/sub/<file>` go to the pictures'
# bucket, which a public domain serves, though neither is a picture's key.
# It reddens r2-signed-urls.test.ts "publicObjectUrl signs anything that is not a picture on show, however the key is written" as well.
# Reddens: unit: r2-public-bucket.test.ts "a picture is uploaded to, read from and signed for the pictures’ bucket; anything else, however it is spelt, stays in the private bucket"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '    return this.publicBucketName && isPublicImageKey(key) ? this.publicBucketName : this.bucketName!\n'
b = '    return this.publicBucketName && isUnderPublicImagePrefix(key) ? this.publicBucketName : this.bucketName!\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-25-a-picture-known-by-its-prefix-goes-public-unit: bucketFor goes by the prefix')
