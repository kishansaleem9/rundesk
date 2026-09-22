# A number with no unit is read as MINUTES instead of hours.
#
# The contract this breaks is stated twice — in `parseEstimate`'s own comment
# ("A BARE NUMBER IS HOURS, which is both what the frame shows (`12` → '12
# hours') and what the old number input already meant — so nobody's existing
# habit changes meaning underneath them") and in frame `01:35`, which puts "12
# hours" under a box holding `12`.
#
# Minutes is the plausible wrong choice, not an arbitrary one: the parser works
# in minutes internally, `totalMinutes` is the accumulator, and `value` arrives
# already in the unit the rest of the function wants. Defaulting to the working
# unit is what a tidy-minded reader does.
#
# AND IT IS SILENT. Every existing estimate in the database stays correct;
# nothing errors; the field still round-trips its own output, because `12`
# becomes `12m` which reads back as `12m` and parses to twelve minutes again.
# Only somebody who types a bare number is quietly given a seventh of what they
# meant.
#
# REDDENS THREE, ALL IN THE FIRST TWO SECTIONS. The suggestion still appears —
# saying "12 minutes" — so "a suggestion row appears" stays green and the check
# that reads its WORDS is the one that fails. `90m`, `2h 15m`, the nonsense
# checks and the quick-create box all carry explicit units and are untouched.
#
# ALSO CAUGHT BY `estimate.test.ts`, 10 pass / 5 fail — the parser's contract is
# pinned in both places, and this patch is where the two agree.
#
# Reddens: time-estimate: "and it reads the frame's own words"
import io
p = '/home/user/rundesk/apps/web/src/lib/estimate.ts'
a = """    // No unit at all means hours — see above.
    const asMinutes = unit.startsWith('m') ? value : value * 60
"""
b = """    // No unit at all means hours — see above.
    const asMinutes = unit === '' || unit.startsWith('m') ? value : value * 60
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('estimate.ts: a bare number is now minutes, so "12" means twelve minutes.')
