# THE WHITEBOARDS PAGE OFFERS A GUEST "New board", which the API refuses, over an
# empty list that says nothing of why.
# Reddens: guest-canvas-scope: "the guest’s whiteboards and mind maps pages say none is shared with them, and offer no New board or New mind map"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-whiteboards-page.tsx'
a = '  if (role === \'guest\') {\n    return (\n      <div className="p-6 h-full flex flex-col gap-4">'
b = '  if (role === \'guest\' && workspaceId === \'\') {\n    return (\n      <div className="p-6 h-full flex flex-col gap-4">'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcv-7-whiteboards-page-offers-guests-a-board: the whiteboards page offers a guest New board')
