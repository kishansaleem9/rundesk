# THE TEST EMAIL NEEDS NO SESSION (`found-30-sep/test-email-route-open`).
#
# The route loses JwtAuthGuard: an anonymous caller reaches the handler, which
# has nobody to read a role from.
#
# Reddens: unit: email.controller.test.ts "runs behind JwtAuthGuard, so an anonymous caller never reaches it"
import io
p = '/home/user/rundesk/apps/api/src/modules/email/email.controller.ts'
a = "  @Post('test')\n  @UseGuards(JwtAuthGuard)\n"
b = "  @Post('test')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-16-the-test-email-needs-no-session-unit: the test email needs no session')
