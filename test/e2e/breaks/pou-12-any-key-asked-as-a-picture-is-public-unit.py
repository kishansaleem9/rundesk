# ANY KEY ASKED FOR AS A PICTURE IS SERVED FROM THE PUBLIC DOMAIN (`found-30-sep/public-cdn-url-makes-every-object-public`):
# `publicObjectUrl` does not ask whether the key is a picture on show, so a caller that asks it of an attachment
# hands out the attachment's permanent address.
# Reddens: unit: r2-signed-urls.test.ts "publicObjectUrl signs anything that is not a picture on show, however the key is written"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = "    if (base && this.publicBucketName && this.publicDomain === 'private-kept' && isPublicImageKey(key)) {\n"
b = "    if (base && this.publicBucketName && this.publicDomain === 'private-kept') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-12-any-key-asked-as-a-picture-is-public-unit: publicObjectUrl serves any key publicly')
