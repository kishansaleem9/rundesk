# THE DOMAIN IS NEVER CHECKED WHEN THE API STARTS (`found-30-sep/public-cdn-url-makes-every-object-public`):
# nothing asks whether `R2_PUBLIC_URL` serves the private bucket until the hourly check, so for the first hour
# nobody is told, and the pictures are signed even where the domain is on their own bucket alone.
# It reddens 4 checks, each named below.
# Reddens: private-object-urls: "and the API says, as an error, when it starts, that the domain serves the private bucket to anybody: disconnect it, and give the pictures a bucket of their own"
#   "an avatar and a logo saved while the pictures shared the private bucket are moved into their own when the API starts, and still load at their saved address — from the public domain"
#   "an avatar and a workspace logo uploaded now go to the pictures' bucket, and their saved address sends a viewer to the public domain, unsigned, which serves them — public by design"
#   "and says so, as an error: the domain serves the private bucket, and belongs on the pictures' bucket alone"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '    await this.checkPublicDomain()\n    void this.movePicturesToPublicBucket()'
b = '    void this.movePicturesToPublicBucket()'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-20-the-domain-is-never-checked-at-boot: the boot does not check the domain')
