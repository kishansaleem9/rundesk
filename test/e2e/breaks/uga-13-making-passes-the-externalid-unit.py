# MAKING A GROUP PASSES THE BODY WHOLE, AS IT DID: whoever manages groups sets the SCIM externalId.
# Reddens: unit: workspace-groups.controller.test.ts "never passes a body’s externalId to the service when a group is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = '    return this.groups.create(workspaceId, user.id, groupCreateInput(body))\n'
b = '    return this.groups.create(workspaceId, user.id, body)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('uga-13-making-passes-the-externalid-unit: create passes the body whole')
