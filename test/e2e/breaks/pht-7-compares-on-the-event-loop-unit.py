# EVERY COMPARE RUNS ON THE API'S ONE THREAD AGAIN, READ BY A TIMER (`found-30-sep/password-hash-holds-the-event-loop`).
#
# `pht-6`'s edit, claimed by the unit test: a 10 ms timer cannot fire while a
# cost-12 compare runs.
#
# Reddens: unit: password-hash.test.ts "a compare runs off the event loop: a 10 ms timer keeps ticking through a cost-12 compare"
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
print('pht-7-compares-on-the-event-loop-unit: every compare is compareSync on the event loop')
