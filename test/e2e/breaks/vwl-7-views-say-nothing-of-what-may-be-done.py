# THE VIEWS SAY NOTHING OF WHAT MAY BE DONE TO THEM, so the page offers every write on every view, as it did.
# Reddens: view-writes-by-level: "the API says who may add a shared view — not the view-only member, the guest or the commenter; the member at Edit — and, view by view, that a reader may change nothing of the admin’s and only their own private view, never as the default, and that deleting one is offered at Full edit, not at Edit"
#   or "a member held to View on one view by a share on it, where the default is Edit, is refused changing or deleting that view in the share’s words (403) and is offered nothing on it, while the list’s other views stay theirs to change"
#   or "a member given Full edit on one view of a view-only list by a share on it renames and deletes that view and is offered that on it, but nothing on the list’s other views, and does not choose the list’s default with it (403)"
#   or "a workspace manager who is no super-admin is offered a member’s protected view to change, delete, default, unprotect or make private, and the member’s shared view to protect, and their rename of the protected one is saved"
#   or "in a view-only list the page offers the member no + View, no ⋯ on the admin’s views — no Update, Rename, Make default or Delete — and no Save view once they change one, on a saved view or a built-in tab"
#   or "their own private view’s ⋯ offers them Update, Rename and Delete, and not Make default, which a private view cannot be"
#   or "the Customize panel draws the admin’s view’s Pin, Private, Protect and Set as default for the member without letting them be pressed, and leaves them Autosave, their own"
#   or "where the default is Edit the member is offered + View and each view’s ⋯ — Update, Rename, Make default, and not Delete, which takes Full edit — and a rename made from it is saved"
#   or "once it is the list’s default the panel no longer offers to make it private, which the server refuses for the default, and still offers to protect it"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = '    return rows.map((row) => ({ ...row, ...viewOffers(row, actor, factsOf(row.id)) }))\n'
b = '    return rows\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-7-views-say-nothing-of-what-may-be-done: the views list carries no offers")
