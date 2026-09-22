# A space with no stored feature map reads as every switch OFF.
#
# The outage `use-space-features.ts` names in its own header: "`features` is
# null on every space made before the column existed, and an absent key has to
# mean 'on' — the alternative is that shipping this hides Priority from every
# existing space in every existing workspace, which is not a feature, it is an
# outage."
#
# The inversion is one identifier. `ALL_SPACE_FEATURES` is right there, and a
# reader who has just written "a space that has not configured anything should
# not have features enabled by default" would change this line and nothing
# else. No type changes, no call site moves, and every space configured since
# the column shipped goes on working perfectly — which is why it would reach
# production.
#
# REDDENS FOUR, AND THE FOURTH IS THE INTERESTING ONE. The three checks about
# the never-configured space fail directly. The count check — "exactly one
# option went — the rest of the control is intact" — fails too, because both
# spaces now offer the same two options and `2 === 2 - 1` is false. That check
# exists to catch a build where everything vanishes, and this is that build.
#
# Reddens: space-features: "features: null reads as every switch ON — grouping by Priority is offered"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-space-features.ts'
a = "  if (!stored) return ALL_SPACE_FEATURES"
b = "  if (!stored) return Object.fromEntries(SPACE_FEATURE_KEYS.map((k) => [k, false])) as SpaceFeatures"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('use-space-features.ts: a space that predates the column now has every feature off.')
