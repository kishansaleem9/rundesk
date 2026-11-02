# DELETE WORKSPACE'S BUTTON IS ON BEFORE THE NAME IS TYPED.
# Reddens: workspace-ownership: "Delete workspace is its owner’s: a member is refused, and the dialog’s button stays off until the name is typed exactly, then deletes it and goes to another workspace"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-ownership-dialogs.tsx'
a = '            disabled={typed !== workspace.name || remove.isPending}\n'
b = '            disabled={remove.isPending}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-11-delete-without-the-name: applied")
