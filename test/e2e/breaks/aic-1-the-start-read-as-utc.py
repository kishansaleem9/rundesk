# AN EVENT ASKED FOR AT 10:00 IS WRITTEN AT 10:00 UTC.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "the Commands tab drafts the event for her to confirm — its title, its time in her own zone, whom it invites — and nothing is in her calendar yet"
#   or "confirmed, the event is in her own Google Calendar at that instant — 10:00 in Karachi, 05:00 UTC — in Room 4, inviting both, Google asked to send the invitations, and the result says where it went"
#
# The asker's own zone is not asked: "10:00" in Karachi goes into the calendar five hours late.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-connected.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  let ms = asUtc - offsetAt(asUtc)\n  ms = asUtc - offsetAt(ms)\n  return new Date(ms)\n',
     '  let ms = asUtc - offsetAt(asUtc)\n  ms = asUtc - offsetAt(ms)\n  return new Date(asUtc + 0 * ms)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-1-the-start-read-as-utc: the start is read as UTC whatever the zone')
