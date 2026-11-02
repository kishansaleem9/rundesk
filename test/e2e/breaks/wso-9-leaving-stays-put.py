# LEAVING (OR DELETING) LEAVES YOU ON THE PAGE YOU WERE ON, a workspace you are no longer in behind it.
# Reddens: workspace-ownership: "Profile › Workspaces marks only what is still theirs as Owner; Leave on it says to transfer it first and leaves nothing; Leave on the other leaves it, recorded, and goes to another workspace"
import io
p = '/home/user/rundesk/apps/web/src/lib/workspace-exit.ts'
a = "  if (next) deps.navigate({ to: '/app/$workspaceId', params: { workspaceId: next }, replace: true })\n  else deps.navigate({ to: '/app', replace: true })\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-9-leaving-stays-put: applied")
