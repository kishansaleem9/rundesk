# THE DIALOG'S BUTTON IS ON BEFORE THE NAME IS TYPED.
# Reddens: workspace-delete-for-good: "Delete for good asks for the workspace’s name, and its button stays off until the name is typed exactly"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '            disabled={typed !== workspace.name || remove.isPending}\n'
b = '            disabled={remove.isPending}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wdg-6-button-on-without-the-name: applied")
