# THE LIST'S DEFAULT IS CHOSEN BY A SHARE ON ONE VIEW: making a view the default asks only the level on it,
# so a member given Full edit on one view of a view-only list sets what the whole list opens on.
# Reddens: view-writes-by-level: "a member given Full edit on one view of a view-only list by a share on it renames and deletes that view and is offered that on it, but nothing on the list’s other views, and does not choose the list’s default with it (403)"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = """    if (patch.isDefault !== undefined && patch.isDefault !== existing.isDefault) {
      await this.assertSharedViewLevel(existing.listId, actor, { kind: 'default view', act: 'changing its' })
    }
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-31-the-default-chosen-on-a-view-share: the list's default is chosen by a share on one view")
