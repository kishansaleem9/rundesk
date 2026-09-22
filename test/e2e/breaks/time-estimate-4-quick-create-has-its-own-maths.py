# The quick-create modal goes back to its own `Number(hours) * 3600`.
#
# This is the tenth-duplicated-logic instance `lib/estimate.ts` was written to
# prevent, and its header names this exact call site: "Two places already
# turned a number into an estimate — the task detail field and the quick-create
# modal, each with its own `Math.round(hours * 3600)`. Teaching one of them to
# understand `90m` and not the other would be the tenth duplicated-logic
# instance in this codebase, and a worse kind than most: the two would then
# DISAGREE about what somebody typed."
#
# Under this patch `90m` in the detail field is ninety minutes and `90m` in the
# quick-create modal is nothing at all — `Number('90m')` is NaN, so the field is
# dropped and the task is created with no estimate. The same three characters,
# two screens, two answers, and no error either time.
#
# The restored arithmetic is exactly what was there: a `Number()` and a
# multiplication, which is what anybody writes when a column holds seconds and
# a box holds hours. It is right for every input the old box allowed.
#
# ONE CHECK, THE LAST, and that is the point of the last check existing at all.
# Every one of the twelve above it drives the detail field, which is untouched
# — so the suite goes twelve-for-twelve and then says the other box means
# something else.
#
# Reddens: time-estimate: "the OTHER estimate box reads `90m` the same way — 5400s"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = """              ...(parseEstimate(estimateHours)
                ? { timeEstimate: parseEstimate(estimateHours)!.seconds }
                : {}),
"""
b = """              ...(Number(estimateHours) > 0
                ? { timeEstimate: Math.round(Number(estimateHours) * 3600) }
                : {}),
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the second estimate box does its own arithmetic again.')
