# THE TIME PAGE GIVES A MANAGER THEIR OWN HOURS ALONE, AS IT DID: their team is missing from the team week.
# Reddens: time-page-reach: "the team week gives the manager the same people the Reports tab does: the near member’s two hours and the plain member’s one, in their space — and no row for the far member"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-entries/time-entries.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    const viewer: ViewerScope = reader.role === 'super_admin' ? { kind: 'all' } : await viewerScopeOf(this.db, workspaceId, reader.id)\n"
b = "    const scoped = reader.role === 'super_admin' ? ({ kind: 'all' } as ViewerScope) : await viewerScopeOf(this.db, workspaceId, reader.id)\n    const viewer = (scoped.kind === 'containers' ? { kind: 'user', userId: reader.id } : scoped) as ViewerScope\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tpr-1-manager-gets-own-hours: managers read their own hours')
