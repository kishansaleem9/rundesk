# A PICTURE ASKED FOR AS AN OBJECT IS HANDED OUT AT ITS PUBLIC ADDRESS (`found-30-sep/public-cdn-url-makes-every-object-public`):
# `getObjectUrl` serves a key under `avatars/` or `workspace-logos/` from the public domain, so the one method
# every private caller uses decides by the key's shape rather than always signing — a key written in that shape
# by any other path is public too, and so is a picture where the domain serves the private bucket.
# It reddens r2-public-bucket.test.ts "publicObjectUrl gives the public domain only where the pictures have a bucket of their own and the domain was seen not to serve the private one" as well.
# It reddens r2-public-bucket.test.ts "a later check that finds the private bucket served takes the domain away from the pictures" as well.
# Reddens: unit: r2-signed-urls.test.ts "and so is an avatar asked for as an object, since only publicObjectUrl serves the public domain"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '  async getObjectUrl(key: string, expiresInSeconds = 900): Promise<string> {\n    this.requireConfigured()\n    const cmd = new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key })\n'
b = '  async getObjectUrl(key: string, expiresInSeconds = 900): Promise<string> {\n    this.requireConfigured()\n    const base = this.publicBase()\n    if (base && isPublicImageKey(key)) return `${base}/${key}`\n    const cmd = new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-10-a-picture-asked-as-an-object-is-public-unit: getObjectUrl serves pictures publicly')
