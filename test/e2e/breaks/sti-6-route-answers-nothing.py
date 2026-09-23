# THE ROUTE REFUSES EVERY KEY: the refusal half with no grant half.
# Reddens: stable-images: "and it answers with a freshly signed URL — cached for less than that URL lives — to the very bytes uploaded"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/public-images.controller.ts'
a = '    if (!this.r2.configured || !PUBLIC_IMAGE_PREFIXES.some((prefix) => isKeyDirectlyUnder(key, prefix))) {\n'
b = '    if (key.length > 0) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sti-6-route-answers-nothing: applied")
