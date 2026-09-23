# A TASK'S EMAIL ADDRESS BEHIND A SIGN-IN AND NOTHING ELSE, as it was.
# Reddens: credential-reads: "somebody from another organisation asking for it is refused, with no address in the answer"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.controller.ts'
a = '  @UseGuards(ResourceMemberGuard)\n  emailAddress('
b = '  emailAddress('
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-2-email-address-open: applied")
