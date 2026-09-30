# EVERY COMPARE RUNS ON THE API'S ONE THREAD AGAIN (`found-30-sep/password-hash-holds-the-event-loop`).
#
# `compare` goes back to bcryptjs's `compareSync`, as sign-in used it: while a
# sign-in's password is compared, about 300 ms at cost 12, no other request is
# answered, and eight at once hold every other reader for seconds.
#
# Reddens: password-hash-time:
#   "while eight sign-ins hash at once, a plain read is answered in a small part of one sign-in’s time: reads sent every 20 ms have a median under a quarter of a refused sign-in’s median"
import io
p = '/home/user/rundesk/apps/api/src/common/security/password-hash.ts'
a = (
    "  compare(plain: string, hashed: string): Promise<boolean> {\n"
    "    return new Promise((resolve, reject) => this.submit({ op: 'compare', plain, hashed, resolve, reject }))\n"
    "  }\n"
)
b = (
    "  compare(plain: string, hashed: string): Promise<boolean> {\n"
    "    return Promise.resolve((require('bcryptjs') as typeof import('bcryptjs')).compareSync(plain, hashed))\n"
    "  }\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pht-6-compares-on-the-event-loop: every compare is compareSync on the event loop')
