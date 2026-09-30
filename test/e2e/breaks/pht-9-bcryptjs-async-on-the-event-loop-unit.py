# EVERY HASH AND COMPARE RUNS AS BCRYPTJS'S ASYNC FORM, READ BY A TIMER (`found-30-sep/password-hash-holds-the-event-loop`).
#
# `pht-8`'s edit, claimed by the unit test: between bcryptjs's 100 ms chunks a
# 10 ms timer fires once, a few times in a cost-12 compare, not every 10 ms.
#
# Reddens: unit: password-hash.test.ts "a compare runs off the event loop: a 10 ms timer keeps ticking through a cost-12 compare"
import io
p = '/home/user/rundesk/apps/api/src/common/security/password-hash.ts'
a = "  private submit(job: Job): void {\n    const worker = this.idle.pop() ?? this.spawn()\n"
b = "  private submit(job: Job): void {\n    if (job) return this.onThisThread(job)\n    const worker = this.idle.pop() ?? this.spawn()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pht-9-bcryptjs-async-on-the-event-loop-unit: every job runs as bcryptjs async on the event loop')
