# THE DOMAIN IS USED WITHOUT BEING CHECKED (`found-30-sep/public-cdn-url-makes-every-object-public`):
# where the pictures have a bucket of their own, `publicObjectUrl` sends a viewer to the domain whatever the
# check found, so a domain left on the private bucket is handed out with every avatar.
# Reddens: private-object-urls: "where the pictures have a bucket of their own but the domain was left on the private one, the API sees it when it starts and sends nobody there: a picture's address is signed, from the pictures' bucket, and still loads"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = "    if (base && this.publicBucketName && this.publicDomain === 'private-kept' && isPublicImageKey(key)) {\n"
b = '    if (base && this.publicBucketName && isPublicImageKey(key)) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-18-the-domain-used-unchecked: publicObjectUrl ignores the check')
