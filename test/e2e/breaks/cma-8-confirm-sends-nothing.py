# Confirm posts an empty action list, so the panel reports a run that created nothing.
# Reddens: create-menu-ai: "carrying exactly the actions that were previewed — nothing added, nothing dropped"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '        body: { workspaceId, actions: plan?.actions ?? [] },\n'
b = '        body: { workspaceId, actions: [] },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: Confirm posts an empty action list, so the panel reports a run that created nothing.')
