# AN ADDRESS ON THE PUBLIC DOMAIN IS NOT READ BACK AS OURS (`found-30-sep/public-cdn-url-makes-every-object-public`):
# `keyFromOwnUrl` knows only the signed shape, so a picture's public address, or a recording's that was handed out
# at the public address before signing was always, is taken for a link of somebody else's and stored as one.
# Reddens: unit: r2-own-url.test.ts "and out of a public-CDN URL"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/r2.service.ts'
a = "    if (this.publicUrl) {\n      const key = underPath(this.publicUrl)\n"
b = "    if (this.publicUrl && false) {\n      const key = underPath(this.publicUrl)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pou-15-a-public-address-is-not-read-back-unit: keyFromOwnUrl ignores the public domain')
