# THE MIND MAPS PAGE OFFERS A GUEST "New mind map", which the API refuses.
# Reddens: guest-canvas-scope: "the guest’s whiteboards and mind maps pages say none is shared with them, and offer no New board or New mind map"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-mindmaps-page.tsx'
a = '  if (role === \'guest\') {\n    return (\n      <div className="p-6 space-y-7 max-w-7xl mx-auto">'
b = '  if (role === \'guest\' && workspaceId === \'\') {\n    return (\n      <div className="p-6 space-y-7 max-w-7xl mx-auto">'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcv-8-mindmaps-page-offers-guests-a-map: the mind maps page offers a guest New mind map')
