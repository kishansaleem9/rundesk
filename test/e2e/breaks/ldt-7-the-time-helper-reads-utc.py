# THE SHARED WALL-CLOCK HELPER READS UTC HOURS: every datetime-local box it
# fills shows somebody else's clock.
# Reddens: local-dates: "the meeting card shows 15:00 for a meeting at 10:00 UTC in ${ZONE}, and saving it leaves the meeting where it was"
import io
p = '/home/user/rundesk/apps/web/src/lib/local-date.ts'
a = 'export const localDateTimeValue = (d: Date) => `${localDayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`\n'
b = 'export const localDateTimeValue = (d: Date) => `${localDayKey(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ldt-7-the-time-helper-reads-utc: localDateTimeValue reads UTC hours')
