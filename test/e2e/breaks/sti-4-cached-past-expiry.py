# THE REDIRECT CACHED FOR AN HOUR — past the fifteen minutes the signed URL it points at lives.
# Reddens: stable-images: "and it answers with a freshly signed URL — cached for less than that URL lives — to the very bytes uploaded"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/public-images.controller.ts'
a = "    return reply.header('Cache-Control', 'public, max-age=600').redirect(url, 302)\n"
b = "    return reply.header('Cache-Control', 'public, max-age=3600').redirect(url, 302)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sti-4-cached-past-expiry: applied")
