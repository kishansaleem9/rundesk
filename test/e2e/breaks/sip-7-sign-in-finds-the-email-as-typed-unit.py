# SIGN-IN FINDS AN EMAIL ONLY AS IT WAS TYPED AGAIN, READ FROM THE QUERY (`found-30-sep/sign-in-reads-the-email-as-typed`).
#
# `sip-6`'s edit, claimed by the unit test: `findByEmail` asks for the email
# exactly as stored, not in any case.
#
# Reddens: unit: users.service.test.ts "findByEmail finds the account in any case: lower(email) = lower(what was typed), the one stored as typed first, then the older"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = "      .where(sameEmail(users.email, email))\n      .orderBy(storedAsTypedFirst(users.email, email), asc(users.createdAt))\n"
b = "      .where(eq(users.email, email))\n      .orderBy(storedAsTypedFirst(users.email, email), asc(users.createdAt))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-7-sign-in-finds-the-email-as-typed-unit: findByEmail compares the email as stored')
