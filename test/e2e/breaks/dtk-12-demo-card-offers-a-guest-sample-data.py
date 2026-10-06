# THE SAMPLE-DATA CARD OFFERS A GUEST LOAD DEMO DATA (`found-6-oct/a-guest-who-may-import-makes-a-space`): granted the key, a guest is offered what
# the API refuses them.
# Reddens: data-transfer-keys: "an empty workspace’s dashboard offers no Load demo data to a guest granted workspace.import by a custom role"
import io
p = '/home/user/rundesk/apps/web/src/components/demo-data-empty-state.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const guest = useWorkspaceRole(workspaceId).role === 'guest'\n"
b = "  const guest = useWorkspaceRole(workspaceId).role === 'guest' && false\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dtk-12-demo-card-offers-a-guest-sample-data: the demo card reads nobody as a guest')
