# DELETING A SHARED VIEW ASKS EDIT, as changing one does: a member refused trashing a task in the list
# deletes its views for good, the list's default too.
# Reddens: view-writes-by-level: "deleting a shared view takes Full edit: a member where the default is Edit and a guest with an Edit share are refused in their level’s words (403) and the view stays, and where the default is Full edit the member deletes one, as does a guest the list is shared with at Full edit"
#   or "the API says who may add a shared view — not the view-only member, the guest or the commenter; the member at Edit — and, view by view, that a reader may change nothing of the admin’s and only their own private view, never as the default, and that deleting one is offered at Full edit, not at Edit"
#   or "where the default is Edit the member is offered + View and each view’s ⋯ — Update, Rename, Make default, and not Delete, which takes Full edit — and a rename made from it is saved"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "export const SHARED_VIEW_DELETE_LEVEL: SpaceDefaultPermission = 'admin'\n"
b = "export const SHARED_VIEW_DELETE_LEVEL: SpaceDefaultPermission = 'edit'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-28-deleting-asks-edit: deleting a shared view asks edit, as changing one does")
