# A PICTURE ON SHOW IS KNOWN BY ITS PREFIX ALONE (`found-30-sep/public-cdn-url-makes-every-object-public`):
# `isPublicImageKey` takes any key that starts with `avatars/` or `workspace-logos/`, so
# `avatars/../workspaces/<ws>/tasks/<task>/attachments/<file>` is served from the public domain, and a browser
# collapses the `..` and fetches the attachment; and the same key is put in the pictures' bucket, which the domain serves.
# It reddens r2-public-bucket.test.ts "a picture is uploaded to, read from and signed for the pictures’ bucket; anything else, however it is spelt, stays in the private bucket" as well.
# It reddens r2-public-bucket.test.ts "movePicturesToPublicBucket moves each picture kept among the private objects into the pictures’ bucket, with its type and metadata, and nothing else" as well.
# Reddens: unit: r2-signed-urls.test.ts "publicObjectUrl signs anything that is not a picture on show, however the key is written"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/object-key-shape.ts'
a = "  return PUBLIC_IMAGE_PREFIXES.some((prefix) => isKeyDirectlyUnder(key, prefix))\n"
b = "  return PUBLIC_IMAGE_PREFIXES.some((prefix) => typeof key === 'string' && key.startsWith(prefix))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-13-a-picture-is-known-by-its-prefix-unit: isPublicImageKey checks the prefix only')
