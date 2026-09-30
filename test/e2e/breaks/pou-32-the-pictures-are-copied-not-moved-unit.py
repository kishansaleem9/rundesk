# THE PICTURES ARE COPIED, NOT MOVED (`found-30-sep/public-cdn-url-makes-every-object-public`):
# each picture is written to its own bucket and left in the private one too, so every boot copies it again and
# a workspace's old logo is kept there.
# Reddens: unit: r2-public-bucket.test.ts "movePicturesToPublicBucket moves each picture kept among the private objects into the pictures’ bucket, with its type and metadata, and nothing else"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '          await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: o.Key }))\n          moved += 1\n'
b = '          moved += 1\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-32-the-pictures-are-copied-not-moved-unit: the move leaves the private copy')
