# THE EMPTY "UPCOMING" PROMISES AGAIN that a connected calendar's meetings will show up there.
# Reddens: meetings-connect-calendar: "the empty \"Upcoming\" promises nothing it does not do: with no calendar it offers Connect Calendar without saying the meetings will then show up here, and with one connected it does not ask for one"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
s = io.open(p, encoding='utf-8').read()
a = "  'meetings.noUpcoming': 'Nothing scheduled.',\n"
b = "  'meetings.noUpcoming': 'Nothing scheduled. Connect a calendar and your meetings will show up here.',\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcc-8-the-promise-again: the empty state promises again')
