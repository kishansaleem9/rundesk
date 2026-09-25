# THE SPACES A GUEST MAY ADD TO ARE NEVER ASKED FOR: a guest given a
# space to edit is offered no list anywhere.
# RE-AIMED 25 September: the hook asks every person's writable spaces now (the view-only
# space's menus), and its guest branch was rewritten around that; the mistake is the same.
# Reddens: guest-create-menu: "given a space with Full edit, a guest is offered a list — in the Create menu and on that space’s menu, not on the space they pass through — and still no task"
#   or "the List form offers the guest the space with Full edit and not the one they pass through — a member is offered both"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-creatable.ts'
a = '    enabled: !!workspaceId,\n'
b = '    enabled: !!workspaceId && !guest,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcm-10-writable-never-asked: the writable spaces are never asked for')
