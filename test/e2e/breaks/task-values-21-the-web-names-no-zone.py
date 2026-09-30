# THE WEB NAMES NO ZONE ON ITS WRITES (`found-30-sep/a-task-starts-after-it-is-due`, found by a review
# of this work): the server, told nothing, orders a day beside a moment as every zone would, so the
# sheet in Karachi sets a start at 09:00 on the 5th beside a due day of the 4th, without a word.
#
# Reddens: task-values: "in the task sheet in Karachi, a start typed at 09:00 on the day after a due day with no time is refused and said — the toast gives the reason — and the task keeps no start, while 09:00 on the due day itself is taken; each write names the zone (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/lib/api.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (zone) headers.set(TIME_ZONE_HEADER, zone)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-21-the-web-names-no-zone: the web sends no zone')
