# WITH NO WORKER, EVERY COMPARE RUNS ON THIS THREAD AT ONCE, READ FROM ITS UNIT TEST (`found-30-sep/a-burst-is-compared-before-the-lock`).
#
# On this thread a compare runs alone and the rest wait their turn. Let them
# all start at once, as they did, and a burst's compares end together, none
# counted before the others are compared.
#
# Reddens: unit: password-hash.test.ts "with no worker to be had, compares run on this thread one at a time, the rest in turn"
import io
p = '/home/user/rundesk/apps/api/src/common/security/password-hash.ts'
a = "    if (this.hereRunning > 0) {\n      this.hereWaiting.push(job)\n      return\n    }\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-80-compares-on-this-thread-run-all-at-once-unit: every compare on this thread at once')
