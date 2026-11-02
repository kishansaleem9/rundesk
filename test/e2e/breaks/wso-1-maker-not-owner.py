# THE MAKER OF A WORKSPACE IS NOT RECORDED AS ITS OWNER: its row names nobody, and the earliest admin answers for it.
# Reddens: workspace-ownership: "whoever makes a workspace owns it: its row names them, it reads as theirs to them and not to its admin, and their list says so, with its four people"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = '          // Whoever makes it owns it (`found-02-nov/workspace-has-no-owner`).\n          ownerId: userId,\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-1-maker-not-owner: applied")
