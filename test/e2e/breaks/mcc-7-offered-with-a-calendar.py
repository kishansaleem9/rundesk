# CONNECT CALENDAR IS OFFERED WHATEVER THE PERSON HAS CONNECTED, as it was.
# Reddens: meetings-connect-calendar: "the empty \"Upcoming\" promises nothing it does not do: with no calendar it offers Connect Calendar without saying the meetings will then show up here, and with one connected it does not ask for one"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const offerConnect = calendarAccounts !== undefined && calendarAccounts.length === 0\n'
b = '  const offerConnect = calendarAccounts !== undefined\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcc-7-offered-with-a-calendar: offered with a calendar connected')
