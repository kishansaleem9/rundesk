# THE PICTURES KEPT AMONG THE PRIVATE OBJECTS ARE NEVER MOVED (`found-30-sep/public-cdn-url-makes-every-object-public`):
# every avatar and logo uploaded before `R2_PUBLIC_BUCKET_NAME` was set stays in `R2_BUCKET_NAME`, and its saved
# address sends a viewer to the pictures' domain, where it is not: a broken picture for everybody who had one.
# Reddens: private-object-urls: "an avatar and a logo saved while the pictures shared the private bucket are moved into their own when the API starts, and still load at their saved address — from the public domain"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '    void this.movePicturesToPublicBucket().catch('
b = '    void Promise.resolve().catch('
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-22-the-pictures-are-never-moved: the pictures are not moved at boot')
