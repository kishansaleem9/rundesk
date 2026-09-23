# THE REDIRECT GOES TO A URL THAT DOES NOT SERVE THE PICTURE — a broken image on every page it is drawn.
# Reddens: stable-images: "the avatar is drawn from its saved address, every place it appears"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/public-images.controller.ts'
a = "    return reply.header('Cache-Control', 'public, max-age=600').redirect(url, 302)\n"
b = "    return reply.header('Cache-Control', 'public, max-age=600').redirect(`${url}-gone`, 302)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sti-7-redirect-to-nowhere: applied")
