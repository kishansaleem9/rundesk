# A KEY THAT MERELY STARTS WITH `avatars/` IS SIGNED — and `avatars/../../` leaves the folder.
# Reddens: stable-images: "another prefix, an encoded dot segment or an escape from the folder is answered 404, with nowhere to go"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/public-images.controller.ts'
a = '    if (!this.r2.configured || !PUBLIC_IMAGE_PREFIXES.some((prefix) => isKeyDirectlyUnder(key, prefix))) {\n'
b = '    if (!this.r2.configured || !PUBLIC_IMAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sti-3-prefix-only: applied")
