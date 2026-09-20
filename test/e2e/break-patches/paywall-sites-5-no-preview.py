# The gate stops TEACHING: no preview of what the locked feature would do.
# Reddens: "the gate PREVIEWS the feature — three concrete lines about what it does".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    highlights: [t('gate.teamViewPoint1'), t('gate.teamViewPoint2'), t('gate.teamViewPoint3')],"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    highlights: [],"))
print('[break 5] emptied the Team-view gate\'s highlights in the list route —')
print('          the paywall now names the feature without previewing it.')
