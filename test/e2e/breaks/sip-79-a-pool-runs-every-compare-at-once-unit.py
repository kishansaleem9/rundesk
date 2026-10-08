# A POOL STARTS A WORKER FOR EVERY COMPARE, READ FROM ITS UNIT TEST (`found-30-sep/a-burst-is-compared-before-the-lock`).
#
# A burst is answered by the compares that end before the lock, so the
# compares in flight are bounded by the pool's threads. Let the pool start a
# worker for every job, and a burst is compared all at once.
#
# Reddens: unit: password-hash.test.ts "a pool runs at most its threads’ compares at once, never more than four on any machine, and the rest in turn"
import io
p = '/home/user/rundesk/apps/api/src/common/security/password-hash.ts'
a = "    if (this.workersUnavailable || this.live.size >= this.threads) return null\n"
b = "    if (this.workersUnavailable) return null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-79-a-pool-runs-every-compare-at-once-unit: a worker for every compare')
