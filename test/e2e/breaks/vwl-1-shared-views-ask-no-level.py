# A SHARED VIEW'S WRITES ASK NO LEVEL: the write rule lets anybody who reads the list change, pin,
# re-default and delete the views everybody shares, as it did (`found-5-oct/readers-change-shared-views`).
# Reddens: view-writes-by-level: "a member of a view-only space and a guest with a view share are refused every change to the list’s shared views — their name and layout, a pin, the list’s default, deleting one — in the level’s words (403), and the views are as the admin left them"
#   or "a member at Comment is refused the same, in its words (403), and where the default is Edit a member makes, renames and defaults the list’s shared views"
#   or "deleting a shared view takes Full edit: a member where the default is Edit and a guest with an Edit share are refused in their level’s words (403) and the view stays, and where the default is Full edit the member deletes one, as does a guest the list is shared with at Full edit"
#   or "a member held to View on one view by a share on it, where the default is Edit, is refused changing or deleting that view in the share’s words (403) and is offered nothing on it, while the list’s other views stay theirs to change"
#   or "a member given Full edit on one view of a view-only list by a share on it renames and deletes that view and is offered that on it, but nothing on the list’s other views, and does not choose the list’s default with it (403)"
#   or "a rename the page still offered and the server refuses says why, in the server’s words, and saves nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = """    if (row.visibility !== 'private') {
      await this.assertSharedViewLevel(
        row.listId,
        actor,
        { kind: 'shared views', act: act === 'delete' ? 'deleting its' : 'changing its' },
        { viewId: row.id, required: act === 'delete' ? SHARED_VIEW_DELETE_LEVEL : SHARED_VIEW_LEVEL },
      )
    }
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-1-shared-views-ask-no-level: a shared view's writes ask no level")
