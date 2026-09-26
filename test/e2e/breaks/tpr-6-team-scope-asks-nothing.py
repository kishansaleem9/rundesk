# THE TEAM SCOPE ASKS NOTHING: a manager’s reports and Time page count everyone’s hours.
# Reddens: time-page-reach: "the Reports tab gives the manager their team’s hours — the near member’s two — and none of the far member’s, outside their spaces"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/viewer-scope.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (viewer.kind !== 'containers') return undefined\n"
b = "  if (viewer.kind !== 'containers' || viewer.userId.length > 0) return undefined\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tpr-6-team-scope-asks-nothing: the containers condition is empty')
