# The Holidays chips stay on the grid whatever the picker says, so the checkbox
# stores a row nobody reads. §V2-02d seen from the other side.
#
# IT RAN GREEN, AND THAT FOUND THE GAP RATHER THAN A BAD PATCH. The check this
# used to name — "unticking Holidays drops the chip by one and is remembered on
# the account" — reads the COUNT BADGE and the STORED ROW, and neither of those
# is the grid. So the one thing unticking Holidays is FOR was asserted nowhere:
# the value was written correctly, the badge moved, the row persisted, and the
# surface the checkbox exists to change was never consulted by any check. That
# is the mirror of the facade, with the suite standing in for the missing
# reader.
#
# `calendar-accounts` now seeds a holiday for TODAY, asserts the chip is on the
# grid with Holidays ticked, and asserts it goes when Holidays is unticked —
# matched by the chip's own title rather than by a date attribute, because
# identity beats arithmetic about which local day a `YYYY-MM-DD` lands on.
#
# PREDICTED ONE. The chip is there either way with the patch applied, so
# "the Holidays calendar puts the day on the grid" still passes — correctly, and
# that is what makes the pair able to tell a change from a state.
#
# Reddens: calendar-accounts: "and unticking it takes the day off the grid — the
#   checkbox is read, not just stored"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '                {holidayCalendarOn &&\n'
b = '                {true &&\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the Holidays calendar cannot be turned off.')
