# THE LIST SAYS NOBODY MAKES A VIEW OF THEIR OWN: + View is offered only where a shared one is.
# (`found-25-sep/view-only-individual-permissions`)
# Reddens: view-only-permissions: "the API says what each may do there, by their own switches: the member no estimate and no time but tags and a view of their own, the guest the estimate and time but no tag and no view; neither may edit the task or add a shared view"
#   or "the member’s list page offers + View, and pressing it makes a view of their own (private), which their level allows where a shared one it does not"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    const privateViews = actor.role === 'super_admin' || level !== 'view' || (await viewOnlyMay(this.db, home.workspaceId, actor.id, 'createViews'))\n",
     "    const privateViews = actor.role === 'super_admin' && level !== 'view' // BROKEN: the list says no view of one's own\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("vop-10-the-list-says-no-view-of-ones-own: the list says no view of one's own")
