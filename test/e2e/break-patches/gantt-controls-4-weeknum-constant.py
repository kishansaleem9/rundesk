# Check 3 — THE WEEK BAND AS A FACADE.
# Every cell prints W1. The band renders, the header grows, the toggle toggles;
# the only assertion that can catch it is one that knows what week it is.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = "        week: isoWeekNumber(cursor),"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "        week: 1,"))
print('BROKE 3: every week in the band is labelled W1')
