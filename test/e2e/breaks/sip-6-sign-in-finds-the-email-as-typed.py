# SIGN-IN FINDS AN EMAIL ONLY AS IT WAS TYPED AGAIN (`found-30-sep/sign-in-reads-the-email-as-typed`).
#
# `findByEmail`, which sign-in, sign-up's check that an email is free,
# forgot-password and the verification resend read the account through,
# compares the email exactly as stored. An account made in lower case is
# refused when its email is typed with a capital; one stored with capitals
# is refused in lower case, sent no reset link, and sign-up makes a second
# account beside it.
#
# Reddens: sign-in-and-password:
#   "an account made in lower case signs in with its email typed with a capital first letter, and all in capitals: 200 with its own session each"
#   "an account stored with capitals, as the retired register route wrote it, signs in with its email typed in lower case, and forgot-password in lower case issues it a reset"
#   "sign-up with that account’s email in lower case is refused 409: no second account is made beside it"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = "      .where(sameEmail(users.email, email))\n      .orderBy(storedAsTypedFirst(users.email, email), asc(users.createdAt))\n"
b = "      .where(eq(users.email, email))\n      .orderBy(storedAsTypedFirst(users.email, email), asc(users.createdAt))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-6-sign-in-finds-the-email-as-typed: findByEmail compares the email as stored')
