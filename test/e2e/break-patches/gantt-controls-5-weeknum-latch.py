# Check 5 — A TOGGLE THAT ONLY GOES ONE WAY.
# Pressing "Week numbers" a second time re-writes `true`. A check that only
# ever turns the band on would never notice.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = """      writeFlag(LS_WEEK_NUMBERS, !prev)
      return !prev"""
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, """      writeFlag(LS_WEEK_NUMBERS, true)
      return true"""))
print('BROKE 5: the week-number toggle latches on and cannot be turned off again')
