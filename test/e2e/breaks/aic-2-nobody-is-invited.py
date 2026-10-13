# THE EVENT IS WRITTEN, AND GOOGLE IS NOT ASKED TO INVITE ANYBODY.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "confirmed, the event is in her own Google Calendar at that instant — 10:00 in Karachi, 05:00 UTC — in Room 4, inviting both, Google asked to send the invitations, and the result says where it went"
#
# Without `sendUpdates=all` Google keeps the attendees on the event and tells none of them.
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-events.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const invite = provider === 'gcal' && e.attendees?.length ? '?sendUpdates=all' : ''\n",
     "  const invite = provider === 'gcal' && e.attendees?.length && provider !== 'gcal' ? '?sendUpdates=all' : ''\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-2-nobody-is-invited: Google is not asked to send the invitations')
