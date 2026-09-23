# THE ROUTE SIGNS ANY KEY IT IS GIVEN — an attachment, a document, anything in the bucket.
# Reddens: stable-images: "another prefix, an encoded dot segment or an escape from the folder is answered 404, with nowhere to go"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/public-images.controller.ts'
a = '    if (!this.r2.configured || !PUBLIC_IMAGE_PREFIXES.some((prefix) => isKeyDirectlyUnder(key, prefix))) {\n'
b = '    if (!this.r2.configured) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sti-2-route-hands-out-anything: applied")
