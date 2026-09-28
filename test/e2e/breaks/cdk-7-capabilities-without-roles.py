# THE PROJECT PAGE'S CAPABILITIES PASS THE RULE NO PERMISSIONS: a delete key cannot be asked, and the page is told nothing.
# Reddens: container-delete-keys: "the project page is told what the routes answer: Delete on another member’s list for the member granted list.delete, Archive of the project for the one granted project.delete, and neither for a plain member"
import io
p = '/home/user/rundesk/apps/api/src/modules/container-members/container-members.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '        // The keys the DELETE routes ask of what somebody else made.\n        roles: this.roles,\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cdk-7-capabilities-without-roles: capabilities pass no roles')
