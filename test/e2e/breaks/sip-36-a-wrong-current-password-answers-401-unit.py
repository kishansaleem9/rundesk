# A WRONG CURRENT PASSWORD IS ANSWERED 401 AGAIN, READ FROM THE SERVICE (`found-30-sep/password-change-guesses-600-an-hour`).
#
# `sip-35`'s edit, claimed by the unit test: the refusal is an
# UnauthorizedException, which a client reads as its session ending.
#
# Reddens: unit: users.service.test.ts "a wrong current password is refused 403, not 401 (the caller’s session is good), and nothing is written"
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
print('sip-36-a-wrong-current-password-answers-401-unit: a wrong current password is answered 401')
