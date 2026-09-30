# A WRONG CURRENT PASSWORD IS ANSWERED 401 AGAIN, IN A BROWSER (`found-30-sep/password-change-guesses-600-an-hour`).
#
# `sip-35`'s edit, measured where a person makes it: the web's client reads the
# 401 as an expired token, refreshes, and sends the change again, so one
# mistyped current password is two changes and counts twice.
#
# Reddens: session-in-the-browser:
#   "one mistyped current password sends one change and counts one wrong password: the page says \"Current password is incorrect\", with no refresh and no second change, and failed_login_attempts reads 1"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
s = io.open(p, encoding='utf-8').read()
a1 = "import { Injectable, Inject, ForbiddenException, BadRequestException } from '@nestjs/common'\n"
b1 = "import { Injectable, Inject, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common'\n"
assert s.count(a1) == 1, f'anchor appears {s.count(a1)} times in {p}, expected exactly 1'
s = s.replace(a1, b1)
a2 = "      throw new ForbiddenException('Current password is incorrect')\n"
b2 = "      throw new UnauthorizedException('Current password is incorrect')\n"
assert s.count(a2) == 1, f'anchor appears {s.count(a2)} times in {p}, expected exactly 1'
s = s.replace(a2, b2)
io.open(p, 'w', encoding='utf-8').write(s)
print('sib-2-a-wrong-current-password-answers-401: a wrong current password is answered 401')
