# THE EVENT GOES INTO THE CALENDAR WITHOUT ITS ATTENDEES.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "confirmed, the event is in her own Google Calendar at that instant — 10:00 in Karachi, 05:00 UTC — in Room 4, inviting both, Google asked to send the invitations, and the result says where it went"
#
# The draft named them; the event written to Google carries nobody.
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-events.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    ...(e.attendees?.length ? { attendees: e.attendees.map((email) => ({ email })) } : {}),\n',
     "    ...(e.attendees?.length && e.title === '' ? { attendees: e.attendees.map((email) => ({ email })) } : {}),\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-3-the-attendees-left-off: the attendees are left off the event Google is sent')
