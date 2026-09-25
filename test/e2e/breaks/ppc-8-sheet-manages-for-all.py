# THE MEMBERS SHEET OFFERS ITS CHANGES TO EVERYBODY AGAIN.
# Reddens: project-page-controls: "a member who did not make the project is offered Statuses and Suggest tasks, and Rename and Delete on the list they made — not Edit or Archive, not the admin’s list, and the members only to read"
#   or "a guest passing through is offered none of them: no Statuses, Suggest tasks, Edit or Archive, no Rename or Delete on the list, and the members at most to read"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        canManage={caps?.members === true}\n'
b = "        canManage={caps?.members === true || projectId !== ''}\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ppc-8-sheet-manages-for-all: the sheet manages for all')
