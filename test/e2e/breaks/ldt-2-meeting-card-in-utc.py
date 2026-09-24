# THE MEETING CARD FILLS ITS WHEN BOX WITH THE UTC WALL CLOCK, which the save
# then reads as local: every open-and-save moves the meeting by the reader's offset.
# Reddens: local-dates: "the meeting card shows 15:00 for a meeting at 10:00 UTC in ${ZONE}, and saving it leaves the meeting where it was"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
a = "    setStartsAt(m?.startsAt ? localDateTimeValue(new Date(m.startsAt)) : '')\n"
b = "    setStartsAt(m?.startsAt ? new Date(m.startsAt).toISOString().slice(0, 16) : '')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ldt-2-meeting-card-in-utc: the meeting card shows the UTC clock')
