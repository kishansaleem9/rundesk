# THE OLD REGISTER ROUTE MAKES ACCOUNTS AGAIN (`found-30-sep/register-counted-apart-from-signup`).
#
# The retired handler goes back to making an account from the old body, through
# sign-up's service, on a route of its own and with no limit: a second way to
# make an account, on a counter nobody keeps, beside sign-up's ten a minute.
#
# Reddens: auth-route-limits:
#   "the old register route is retired: it answers 410 naming sign-up, and makes nothing — sign-up with the same email then makes the account"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.controller.ts'
a = (
    "  @Post('register')\n"
    "  @ApiOperation({ summary: 'Retired: answers 410. Make an account with POST /auth/signup' })\n"
    "  register(): never {\n"
    "    throw new GoneException('POST /auth/register has been retired. Make an account with POST /auth/signup.')\n"
    "  }\n"
)
b = (
    "  @Post('register')\n"
    "  @ApiOperation({ summary: 'Register a new user - DEPRECATED: use /signup' })\n"
    "  async register(@Body() dto?: any, @Req() req?: FastifyRequest, @Res({ passthrough: true }) res?: FastifyReply) {\n"
    "    const bundle = await this.authService.signUp({ email: dto.email, fullName: dto.displayName, password: dto.password, organizationName: dto.displayName } as SignupDto, sessionMeta(req as FastifyRequest))\n"
    "    this.issueCookies(res as FastifyReply, bundle)\n"
    "    return bundle\n"
    "  }\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-19-register-makes-accounts-again: the old register route makes accounts again')
