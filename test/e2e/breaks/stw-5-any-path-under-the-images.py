# ANY ADDRESS UNDER THE PUBLIC IMAGES PASSES, its key's shape unasked: `..` walks out of the avatars.
# Reddens: settings-writes: "a save that sends back the picture a sign-in provider saved keeps it — and an address that walks out of the avatars is refused"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/public-images.controller.ts'
a = "  return typeof url === 'string' && url.startsWith(base) && isKeyDirectlyUnder(url.slice(base.length), prefix)\n"
b = "  return typeof url === 'string' && url.startsWith(base + prefix)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("stw-5-any-path-under-the-images: applied")
