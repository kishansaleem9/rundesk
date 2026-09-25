# THE PAGE TELLS THE PANEL WHETHER THE READER MAY EDIT, NOT ADD: an Edit reader is offered a hook they may not make.
# Reddens: inbound-hook-makers: "the Email panel offers a new webhook only where the reader may add: not in the view-only list, not in the Edit one, and in the Full edit one"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = 'mayAddTasks={listAccess.add} />'
b = 'mayAddTasks={listAccess.edit} />'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ihm-4-page-passes-edit: applied')
