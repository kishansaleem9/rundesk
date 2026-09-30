# ANY MEMBER MAY SEND THE TEST EMAIL (`found-30-sep/test-email-route-open`).
#
# The session guard stays and the super-admin check goes: anybody with an
# account sends any subject and HTML to any address from the product's sender.
#
# Reddens: auth-route-limits:
#   "the test email route refuses an ordinary member: 403, super admins only"
import io
p = '/home/user/rundesk/apps/api/src/modules/email/email.controller.ts'
a = "    if (user?.role !== 'super_admin') throw new ForbiddenException('Super admin access required')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-4-a-member-may-send-the-test-email: any member sends the test email')
