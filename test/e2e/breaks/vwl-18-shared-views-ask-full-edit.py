# SHARED VIEWS ASK FULL EDIT, so a member where the default is Edit makes and changes none, where ClickUp's Edit makes views.
# Reddens: view-writes-by-level: "a member at Comment is refused the same, in its words (403), and where the default is Edit a member makes, renames and defaults the list’s shared views"
#   or "the API says who may add a shared view — not the view-only member, the guest or the commenter; the member at Edit — and, view by view, that a reader may change nothing of the admin’s and only their own private view, never as the default, and that deleting one is offered at Full edit, not at Edit"
#   or "a member held to View on one view by a share on it, where the default is Edit, is refused changing or deleting that view in the share’s words (403) and is offered nothing on it, while the list’s other views stay theirs to change"
#   or "where the default is Edit the member is offered + View and each view’s ⋯ — Update, Rename, Make default, and not Delete, which takes Full edit — and a rename made from it is saved"
#   or "on a view of their own where the default is Edit the Customize panel lets the member press Pin, Private, Protect and Set as default, and the pin and the default they press are saved"
#   or "once it is the list’s default the panel no longer offers to make it private, which the server refuses for the default, and still offers to protect it"
#   or "a rename the page still offered and the server refuses says why, in the server’s words, and saves nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "export const SHARED_VIEW_LEVEL: SpaceDefaultPermission = 'edit'\n"
b = "export const SHARED_VIEW_LEVEL: SpaceDefaultPermission = 'admin'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-18-shared-views-ask-full-edit: shared views ask full edit, so a member where the default is edit makes and changes none, where clickup's edit makes views")
