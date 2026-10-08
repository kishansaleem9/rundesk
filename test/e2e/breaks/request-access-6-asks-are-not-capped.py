# ONE PERSON'S ACCESS ASKS ARE NOT CAPPED (`found-30-sep/access-asks-from-outside-the-workspace`).
#
# An asker's asks are capped at twenty an hour. Let the count be read and not
# asked, and the twenty-first is recorded and its admins told like the first.
#
# Reddens: request-access:
#   "and one person’s asks are capped at 20 an hour: the next is refused, recorded nowhere and told to nobody"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = "    if ((asked?.n ?? 0) >= ACCESS_ASKS_PER_HOUR) throw new HttpException(TOO_MANY_ASKS, HttpStatus.TOO_MANY_REQUESTS)\n"
b = "    void asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('request-access-6-asks-are-not-capped: an asker may ask without end')
