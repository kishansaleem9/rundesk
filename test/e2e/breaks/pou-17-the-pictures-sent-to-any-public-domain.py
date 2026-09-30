# A PICTURE IS SENT TO ANY PUBLIC DOMAIN, AS THE FIRST FIX HAD IT (`found-30-sep/public-cdn-url-makes-every-object-public`):
# `publicObjectUrl` gives `${R2_PUBLIC_URL}/<key>` for every picture wherever the pictures are and whatever the
# domain serves, so where it is on the private bucket the images route tells anybody, signed in or not, where
# every task file can be read unsigned.
# It reddens 2 checks, each named below.
# Reddens: private-object-urls: "and no route tells anybody where that domain is: an avatar and a workspace logo are sent to a signed URL, which serves them, not to their address at the domain"
#   "where the pictures have a bucket of their own but the domain was left on the private one, the API sees it when it starts and sends nobody there: a picture's address is signed, from the pictures' bucket, and still loads"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = "    if (base && this.publicBucketName && this.publicDomain === 'private-kept' && isPublicImageKey(key)) {\n"
b = '    if (base && isPublicImageKey(key)) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-17-the-pictures-sent-to-any-public-domain: publicObjectUrl uses the domain whatever it serves')
