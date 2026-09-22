# "4 days" draws seven columns: the label changes and the grid does not.
#
# The first of the three ways the suite says a span selector is easy to build
# wrongly — "the label changes and the grid does not" — and the cheapest to
# cause, because `plannerRange`'s four-day branch is one line whose only job is
# to be a different number from the week's.
#
# Falling through to the week branch is not a neutral wrong answer either: the
# week branch honours `showWeekends`, and the four-day branch deliberately does
# not. The comment says why: "On Day or 4 days the person navigated to a
# specific span, and dropping the Saturday they asked for would leave them
# looking at an empty grid wondering what broke." So a workspace with weekends
# hidden gets five columns under a button that says four.
#
# ONE CHECK. Day still draws one, Month still draws its grid, the fetch still
# follows the days, the arrows still step a month, the shortcuts still behave.
# Only the button that says four is wrong about four — and the check counts
# columns rather than reading the label, which is the whole reason it can tell.
#
# ALSO CAUGHT BY `planner-view.test.ts`, 8 pass / 2 fail. The two halves earn
# their keep differently: the unit test says the range is wrong, the browser
# check says the GRID is, and a build where the module is right and the grid
# ignores it would only trip the second.
#
# Reddens: planner-views: "4 days draws four"
import io
p = '/home/user/rundesk/apps/web/src/lib/planner-view.ts'
a = "  if (view === 'four') return Array.from({ length: 4 }, (_, i) => addDays(startOfDay(anchor), i))\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner-view.ts: the 4-days span falls through to the week.')
