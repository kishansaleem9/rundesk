# A MANAGER IS OFFERED WHAT A MEMBER IS: the page hides a workspace manager's ⋯ and switches on a member's
# protected view, which the routes then let them change.
# Reddens: view-writes-by-level: "a workspace manager who is no super-admin is offered a member’s protected view to change, delete, default, unprotect or make private, and the member’s shared view to protect, and their rename of the protected one is saved"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = '    const manager = viewIds.length ? await this.isManagerOfViewsWorkspace(viewIds[0], actor) : false\n'
b = '    const manager = false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-32-a-manager-offered-nothing: a manager is offered what a member is")
