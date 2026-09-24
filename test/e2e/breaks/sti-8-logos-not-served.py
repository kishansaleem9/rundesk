# LOGOS ARE NOT AMONG THE PUBLIC PICTURES: a saved logo address answers 404, and the logo is not drawn.
# RE-AIMED 24 September: dropping the prefix from the tuple narrowed its type, and
# the workspace service's typed call no longer compiled (BUILD FAILED twice); the
# serving route is where the mistake shows, so it is made there.
# Reddens: stable-images: "and the workspace logo from its own"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/public-images.controller.ts'
a = "    if (!this.r2.configured || !PUBLIC_IMAGE_PREFIXES.some((prefix) => isKeyDirectlyUnder(key, prefix))) {\n"
b = "    if (!this.r2.configured || !PUBLIC_IMAGE_PREFIXES.some((prefix) => prefix === 'avatars/' && isKeyDirectlyUnder(key, prefix))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sti-8-logos-not-served: applied")
