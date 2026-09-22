# The stored feature map is used as-is instead of being merged over
# `ALL_SPACE_FEATURES`.
#
# An absent key then reads as `undefined`, which is falsy, so every space whose
# row was written before a new switch shipped loses that switch the day it
# ships. The line's own comment says exactly this: "a stored map written before
# a new feature key existed must not read as 'that new feature is off'."
#
# THIS PATCH WOULD HAVE RUN GREEN YESTERDAY, AND THAT IS WHY IT IS HERE. The
# suite had two fixtures: one space with NO map and one with a COMPLETE map.
# For the first, `stored` is null and this line is never reached; for the
# second, `{ ...ALL, ...stored }` and `stored` are the same six keys with the
# same six values. The merge could have been deleted with the suite green — a
# defensive line nothing defends, which is the same shape as a switch that
# writes a column nobody reads.
#
# The third fixture says `{ priority: false }` and nothing else, which is what a
# row written before `listEmail` existed looks like. Under this patch Priority
# is correctly gone and Email to List goes with it, for no reason anybody
# stored.
#
# ONE CHECK. The never-configured space never reaches this line, and the
# fully-configured one is unaffected, so the eight checks above stay green and
# the failure names the merge.
#
# Reddens: space-features: "and a key the map never mentions stays ON — Email to List is still there"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-space-features.ts'
a = "  return { ...ALL_SPACE_FEATURES, ...stored } as SpaceFeatures"
b = "  return stored as SpaceFeatures"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('use-space-features.ts: a key absent from the stored map now reads as switched off.')
