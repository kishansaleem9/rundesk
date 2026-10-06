# Connect Calendar is offered before the person's calendars have answered, to
# somebody who may well have one.
# Reddens: meetings-connect-calendar: "before the member’s meetings have answered, \"Upcoming\" does not say nothing is scheduled, and before their calendars have, it does not offer Connect Calendar — it says it is checking"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
a = "  const offerConnect = calendarAccounts !== undefined && calendarAccounts.length === 0\n"
b = "  const offerConnect = !calendarAccounts?.length\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-meetings-page.tsx: Connect Calendar offered before the calendars answer.')
