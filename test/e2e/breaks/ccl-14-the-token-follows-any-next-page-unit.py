# THE TOKEN FOLLOWS GRAPH'S NEXT PAGE TO ANY HOST it names (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: unit: calendar-events.test.ts "a Graph next page is followed on Graph’s own host, and never to another one with the token"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-events.ts'
a = '    elsewhere = !!link && new URL(link).host !== host\n'
b = '    elsewhere = false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ccl-14-the-token-follows-any-next-page-unit: the token follows graph's next page to any host it names (`found-25-sep/connected-calendars-read-by-nothing`)")
