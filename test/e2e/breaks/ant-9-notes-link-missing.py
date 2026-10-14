# A DONE VISIT DOES NOT OPEN ITS NOTES.
# (`commit-log/log-39863ff-1`)
#
# The panel says "Notes ready" and offers no way to them: the person searches
# the Meetings list for a meeting it never named.
#
# Reddens: ai-notetaker: "the visit, done, opens the notes it wrote"
import io
p = '/home/user/rundesk/apps/web/src/components/notetaker-panel.tsx'
a = "                  {r.status === 'done' && r.meetingId && ("
b = "                  {false && r.meetingId && ("
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('notetaker-panel.tsx: no Open notes on a done visit.')
