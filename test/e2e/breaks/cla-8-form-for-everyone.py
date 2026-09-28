# THE PROJECT PAGE OFFERS "+ NEW CLIENT NAME" TO EVERYBODY, AS IT DID: a plain member is shown the form the API refuses.
# Reddens: client-access: "the project page’s Client section offers a plain member no “+ New client name” form, and says adding a client is for those who manage clients"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const mayAddClient = usePermissions(workspaceId).can('client.manage')\n"
b = "  const mayAddClient: boolean | null = usePermissions(workspaceId).can('client.manage') === null ? null : true\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cla-8-form-for-everyone: the add form is offered to everyone')
