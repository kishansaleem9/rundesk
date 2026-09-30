# A WRONG CURRENT PASSWORD IS ANSWERED 401 AGAIN (`found-30-sep/password-change-guesses-600-an-hour`).
#
# 401 says the request's session is not good, which it is: a client that reads
# 401 as an expired token (the web's does) refreshes and sends the change
# again, so each mistyped current password is compared, and counted, twice.
#
# Reddens: sign-in-and-password:
#   "a burst of 11 password changes by one person in one minute, each with a wrong current password and the workspace’s lockout off: 10 are answered 403 by the route, and the eleventh is refused with 429 and a Retry-After"
#   "the budget is the person’s, not the address’s: the same person asking from another address in that minute is refused 429, and another person at the first address is answered 403"
#   "five wrong current passwords in a row count toward the account’s lockout as five wrong sign-ins would: the first four are refused 403 and counted 1 to 4, and the fifth locks the account and is refused 423 saying so"
#   "wrong passwords at sign-in and at the change share one count: three wrong sign-ins and then two wrong current passwords lock the account at the policy’s five, and its right password is refused 401 at sign-in"
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
print('sip-35-a-wrong-current-password-answers-401: a wrong current password is answered 401')
