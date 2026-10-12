# Check 5 — A TOGGLE THAT ONLY GOES ONE WAY.
# Pressing "Week numbers" a second time re-writes `true`. A check that only
# ever turns the band on would never notice.
#
# Reddens: gantt-controls: "and it is a toggle, not a latch: pressing it again takes the band away"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx')
s = io.open(p, encoding='utf-8').read()
a = """      writeFlag(LS_WEEK_NUMBERS, !prev)
      return !prev"""
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, """      writeFlag(LS_WEEK_NUMBERS, true)
      return true"""))
print('BROKE 5: the week-number toggle latches on and cannot be turned off again')
