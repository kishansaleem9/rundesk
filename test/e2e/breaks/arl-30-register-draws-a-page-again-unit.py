# `/register` DRAWS A PAGE OF ITS OWN AGAIN (`found-30-sep/register-counted-apart-from-signup`).
#
# The route's redirect to sign-up goes: `/register` is a route with nothing to
# send anybody on, where a visitor used to meet the old register form.
#
# Reddens: unit: register-sends-to-sign-up.test.ts "opening /register is redirected to /sign-up, in place, before anything of a page loads"
import io
p = '/home/user/rundesk/apps/web/src/routes/register.tsx'
a = (
    "export const Route = createFileRoute('/register')({\n"
    "  beforeLoad: () => {\n"
    "    throw redirect({ to: '/sign-up', replace: true })\n"
    "  },\n"
    "})\n"
)
b = (
    "void redirect\n"
    "export const Route = createFileRoute('/register')({})\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-30-register-draws-a-page-again-unit: /register no longer sends to /sign-up')
