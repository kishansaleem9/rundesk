# The group-by control offers Priority whatever the space's switch says.
#
# The switch is still stored, still sent, still read by every other read site —
# and this one control goes on offering to bucket a list by a field the space
# has hidden. That produces groups for something nothing on screen displays,
# which is the precise thing the comment on this line exists to prevent:
# "Grouping by a field the space has switched off would produce buckets for
# something nothing displays."
#
# One read site out of several, which is the point. `space-presets.mjs` and
# `space-wizard.mjs` prove the value is chosen, sent and stored; this suite is
# the one that decides whether the grid of switches is a feature or a picture
# of one, and it can only do that by checking each read site separately.
#
# REDDENS THREE, WHICH IS ONE MORE THAN PREDICTED. "Priority is gone from the
# group-by" fails because it is not; "exactly one option went" fails because
# none did; and the partial-map space checks the group-by too, so its "the key
# the map names is honoured" fails as well. All three are about this one
# control. The Email button and the filter panel still honour their switches,
# so the failure names the control rather than the feature — which is what the
# prediction was for, even though the count was low by one.
#
# Reddens: space-features: "Priority is gone from the group-by"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = '                {spaceFeatures.priority && <option value="priority">{t(\'list.groupByPriority\')}</option>}'
b = '                <option value="priority">{t(\'list.groupByPriority\')}</option>'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: the group-by offers Priority even where the space switched it off.')
