# The features map is built from the preset's list alone, so a ClickApp the
# preset does not ask for is ABSENT rather than false.
#
# A missing key reads as "on" to every consumer — that is what the check beside
# it says in its own failure message — so a space created from the Project card
# silently has WIP limits enabled. Absent is not the same as off, and the
# column is the only place that difference is recorded.
#
# REPLACES a patch that removed the plan filter from `preset.features`. That
# one verified its claim and could not redden it: the map is built over ALL
# `SPACE_FEATURE_KEYS` with `features.includes(k)`, so `wipLimits` comes out
# false whether or not the preset's own list was filtered. A claim chosen
# because it verifies, caught by reading the line the check depends on rather
# than the line the patch touches — the third time in this session.
#
# Reddens: space-presets: "while the ones it does not ask for are off, not merely absent"
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
a = "        features: features ? Object.fromEntries(SPACE_FEATURE_KEYS.map((k) => [k, features.includes(k)])) : null,\n"
b = "        features: features ? Object.fromEntries(features.map((k) => [k, true])) : null,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('spaces.service.ts: unasked ClickApps are omitted from the features map rather than written false.')
