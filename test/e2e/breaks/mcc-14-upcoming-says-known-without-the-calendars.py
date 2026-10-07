# "Upcoming" says it knows once the meetings are in, before the person's
# calendars have answered, so whatever waits on it reads the offer early.
# Re-aimed 7 October: the calendars' events now hold it at checking too, after
# this branch (`found-25-sep/connected-calendars-read-by-nothing`); this takes
# out the accounts' branch alone, as before.
# Reddens: meetings-connect-calendar: "before the member’s meetings have answered, \"Upcoming\" does not say nothing is scheduled, and before their calendars have, it does not offer Connect Calendar — it says it is checking"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
a = """      : calendarAccounts === undefined && !accounts.isError
      ? 'checking'
      : hasCalendars && calendar.isPending
"""
b = """      : hasCalendars && calendar.isPending
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-meetings-page.tsx: Upcoming says known without the calendars.')
