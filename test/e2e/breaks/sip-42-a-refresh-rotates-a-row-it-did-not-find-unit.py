# A REFRESH WHOSE ROTATION MATCHED NO ROW IS ANSWERED ANYWAY (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# The rotation's UPDATE finds no live row with the presented refresh token
# (another refresh rotated it first, or something revoked it), and the refresh
# answers new tokens all the same: their session names a row that is not live,
# or was revoked a moment before.
#
# Reddens: unit: auth.service.test.ts "a refresh whose session another refresh has just rotated, or something revoked, is refused and makes no session"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = "      if (!kept) throw new UnauthorizedException('Session expired')\n"
b = "      void kept\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-42-a-refresh-rotates-a-row-it-did-not-find-unit: a rotation that matched nothing is answered')
