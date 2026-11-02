# A MEMBER DELETES THE WORKSPACE: the owner's rule is not asked.
# Reddens: workspace-ownership: "Delete workspace is its owner’s: a member is refused, and the dialog’s button stays off until the name is typed exactly, then deletes it and goes to another workspace"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = '    if (actor && !(await this.actsAsOwner(ws, actor))) {\n'
b = '    if (actor && !(await this.actsAsOwner(ws, actor)) && Boolean(0)) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-10-a-member-deletes: applied")
