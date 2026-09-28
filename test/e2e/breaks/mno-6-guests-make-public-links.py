# A GUEST MAY MAKE A PUBLIC LINK: the guest refusal is not asked.
# Reddens: menu-offers: "a doc’s public link: a View share may not make one and an Edit share may, and a guest with an Edit share may not — as POST /docs/:id/share answers (403 for the two refused)"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (role === 'guest') throw new ForbiddenException('Guests cannot share docs')\n    if (making && !doc.publicShareId) {\n"
b = "    if (role === 'guest' && Boolean(0)) throw new ForbiddenException('Guests cannot share docs')\n    if (making && !doc.publicShareId) {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mno-6-guests-make-public-links: done')
