# ONE PERSON'S ACCESS ASKS ARE NOT CAPPED, READ FROM ITS UNIT TEST (`found-30-sep/access-asks-from-outside-the-workspace`).
#
# Reddens: unit: request-access.test.ts "refuses an asker their next ask once they have made an hour’s worth, telling nobody; the same object again is still “already asked”"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = "    if ((asked?.n ?? 0) >= ACCESS_ASKS_PER_HOUR) throw new HttpException(TOO_MANY_ASKS, HttpStatus.TOO_MANY_REQUESTS)\n"
b = "    void asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('request-access-8-asks-are-not-capped-unit: an asker may ask without end')
