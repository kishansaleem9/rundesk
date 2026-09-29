# THE ARCHIVED LIST OFFERS DELETE FOR GOOD TO EVERYONE WHO SEES IT, owner or not.
# Reddens: workspace-delete-for-good: "the owner of the workspace’s organization is offered Delete for good on the archived workspace, and an admin of it who owns no organization of it is not"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '              {entry.mayDeleteForGood && (\n'
b = '              {Boolean(entry.workspace.id) && (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wdg-1-offered-to-every-admin: applied")
