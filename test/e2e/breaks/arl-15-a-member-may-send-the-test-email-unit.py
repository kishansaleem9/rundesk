# ANY MEMBER MAY SEND THE TEST EMAIL, READ BY THE UNIT TEST (`found-30-sep/test-email-route-open`).
#
# `arl-4`'s edit: the super-admin check goes and the session guard stays.
#
# Reddens: unit: email.controller.test.ts "refuses an ordinary member with 403, and sends nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/email/email.controller.ts'
a = "    if (user?.role !== 'super_admin') throw new ForbiddenException('Super admin access required')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-15-a-member-may-send-the-test-email-unit: any member sends the test email')
