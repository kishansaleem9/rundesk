# The grid runs 6am to 11pm again instead of covering the day.
#
# This is a regression the suite was rewritten to catch by CAUSE rather than by
# symptom, and its comment says why: "The grid used to run 6am–11pm, so
# `nowOffset` was null between midnight and six and NO now-line was drawn — the
# assertion below passed every daytime run and failed the first run that
# crossed midnight."
#
# So the defect is two-headed. Work done before six has nowhere to sit, and the
# now-line silently disappears for six hours a night — which is a suite that
# fails in CI at 02:00 and passes on every desk, about a product that is
# genuinely wrong at 02:00.
#
# `FIRST_HOUR = 0` is a constant named after a business decision anybody might
# re-make: "nobody works at 4am" is a sentence, and six is a number that looks
# considered.
#
# ONE CHECK, AND IT IS THE ONE THAT PINS THE CAUSE. Counting the hour labels
# fails at any hour of the day with a reason; the now-line check beside it
# would fail only between midnight and six, which is what made the original
# failure look like flakiness.
#
# Reddens: planner-grid: "every hour of the day has a row"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "const FIRST_HOUR = 0\nconst LAST_HOUR = 23"
b = "const FIRST_HOUR = 6\nconst LAST_HOUR = 22"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the grid covers a working day again, not a day.')
