# THE PICTURES ON SHOW LOSE THE PUBLIC DOMAIN (`found-30-sep/public-cdn-url-makes-every-object-public`): an
# avatar's and a logo's stable address sends a viewer to a signed URL even where the pictures have a bucket of their
# own and `R2_PUBLIC_URL` is on it alone, so every picture on every page is signed again and never served by the CDN
# it was configured for.
# Reddens: private-object-urls: "an avatar and a logo saved while the pictures shared the private bucket are moved into their own when the API starts, and still load at their saved address — from the public domain"
#   "an avatar and a workspace logo uploaded now go to the pictures' bucket, and their saved address sends a viewer to the public domain, unsigned, which serves them — public by design"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/public-images.controller.ts'
a = "    const url = await this.r2.publicObjectUrl(key)\n"
b = "    const url = await this.r2.getObjectUrl(key)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-7-the-pictures-lose-the-public-domain: avatars and logos are always signed')
