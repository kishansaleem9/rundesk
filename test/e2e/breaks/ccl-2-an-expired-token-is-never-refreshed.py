# AN EXPIRED TOKEN IS NEVER REFRESHED, so its calendar is refused an hour after connecting (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: connected-calendars:
#   "and a calendar whose token has expired is read with a token refreshed at its token address, which is kept"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-accounts.service.ts'
a = '      if (!res.ok) return null\n'
b = '      if (res.ok || !res.ok) return null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccl-2-an-expired-token-is-never-refreshed: an expired token is never refreshed, so its calendar is refused an hour after connecting (`found-25-sep/connected-calendars-read-by-nothing`)')
