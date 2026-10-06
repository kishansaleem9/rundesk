# The upcoming meetings default to none while they load, so "Upcoming" says
# "Nothing scheduled" before anybody has answered.
# Reddens: meetings-connect-calendar: "before the member’s meetings have answered, \"Upcoming\" does not say nothing is scheduled, and before their calendars have, it does not offer Connect Calendar — it says it is checking"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-meetings-page.tsx'
a = "      <UpcomingMeetings meetings={upcomingQuery.data} failed={upcomingQuery.isError} />\n"
b = "      <UpcomingMeetings meetings={upcomingQuery.data ?? []} failed={upcomingQuery.isError} />\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-meetings-page.tsx: Upcoming says nothing is scheduled while it loads.')
