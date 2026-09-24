# THE REDIRECT GOES TO A URL THAT DOES NOT SERVE THE PICTURE — a broken image on every page it is drawn.
# RE-AIMED 24 September: `${url}-gone` only lengthened the last query value, and
# the lanes' storage stub serves a key whatever its signature says, so the picture
# still loaded and the patch measured nothing (green twice). The key is what is
# damaged now: the object's path, which the stub answers 404 for.
# Reddens: stable-images: "the avatar is drawn from its saved address, every place it appears"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/public-images.controller.ts'
a = "    return reply.header('Cache-Control', 'public, max-age=600').redirect(url, 302)\n"
b = "    return reply.header('Cache-Control', 'public, max-age=600').redirect(url.replace('?', '-gone?'), 302)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sti-7-redirect-to-nowhere: applied")
