# THE TEST EMAIL IS ANYBODY'S AGAIN (`found-30-sep/test-email-route-open`).
#
# The route loses its session guard and its super-admin check, as it was:
# outside production it sends any subject and HTML to any address for anybody.
#
# Reddens: auth-route-limits:
#   "the test email route refuses a caller with no session: 401"
#   "the test email route refuses an ordinary member: 403, super admins only"
import io
p = '/home/user/rundesk/apps/api/src/modules/email/email.controller.ts'
a = "  @Post('test')\n  @UseGuards(JwtAuthGuard)\n  @ApiBearerAuth()\n  @ApiOperation({ summary: 'Send a test email (super admin; not in production)' })\n  async sendTestEmail(\n    @CurrentUser() user: CurrentUserPayload,\n    @Body() body: { to: string; subject?: string; html?: string },\n  ) {\n    if (user?.role !== 'super_admin') throw new ForbiddenException('Super admin access required')\n"
b = "  @Post('test')\n  @ApiBearerAuth()\n  @ApiOperation({ summary: 'Send a test email (super admin; not in production)' })\n  async sendTestEmail(\n    @CurrentUser() user: CurrentUserPayload,\n    @Body() body: { to: string; subject?: string; html?: string },\n  ) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-3-the-test-email-is-anybodys: the test email sends for anybody')
