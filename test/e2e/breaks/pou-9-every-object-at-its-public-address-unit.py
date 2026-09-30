# EVERY OBJECT IS HANDED OUT AT ITS PERMANENT PUBLIC ADDRESS AGAIN (`found-30-sep/public-cdn-url-makes-every-object-public`):
# `getObjectUrl` answers `${R2_PUBLIC_URL}/<key>` whenever that is a public domain, as it did — an attachment's,
# a clip's, a recording's, and an avatar's asked for as an object; and `publicObjectUrl`'s signed answer for
# anything else is `getObjectUrl`'s, so that is public too.
# It reddens r2-signed-urls.test.ts "and so is an avatar asked for as an object, since only publicObjectUrl serves the public domain" as well.
# It reddens r2-signed-urls.test.ts "publicObjectUrl signs anything that is not a picture on show, however the key is written" as well.
# It reddens r2-public-bucket.test.ts "publicObjectUrl gives the public domain only where the pictures have a bucket of their own and the domain was seen not to serve the private one" as well.
# It reddens r2-public-bucket.test.ts "a later check that finds the private bucket served takes the domain away from the pictures" as well.
# Reddens: unit: r2-signed-urls.test.ts "getObjectUrl signs every key though R2_PUBLIC_URL is a public domain, for fifteen minutes unless asked"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = '  async getObjectUrl(key: string, expiresInSeconds = 900): Promise<string> {\n    this.requireConfigured()\n    const cmd = new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key })\n'
b = '  async getObjectUrl(key: string, expiresInSeconds = 900): Promise<string> {\n    this.requireConfigured()\n    const base = this.publicBase()\n    if (base) return `${base}/${key}`\n    const cmd = new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-9-every-object-at-its-public-address-unit: getObjectUrl answers the public address again')
