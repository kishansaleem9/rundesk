# EVERY HASH AND COMPARE RUNS AS BCRYPTJS'S ASYNC FORM, ON THE EVENT LOOP (`found-30-sep/password-hash-holds-the-event-loop`).
#
# No worker: every job goes to bcryptjs's own `hash`/`compare`, which yield
# between chunks of up to 100 ms. The fix the ledger named first, and not
# enough: with eight compares in flight, every turn of the event loop runs a
# chunk of each before it reads a socket again.
#
# Reddens: password-hash-time:
#   "while eight sign-ins hash at once, a plain read is answered in a small part of one sign-in’s time: reads sent every 20 ms have a median under a quarter of a refused sign-in’s median"
import io
p = '/home/user/rundesk/apps/api/src/common/security/password-hash.ts'
a = "  private submit(job: Job): void {\n    const worker = this.idle.pop() ?? this.spawn()\n"
b = "  private submit(job: Job): void {\n    if (job) return this.onThisThread(job)\n    const worker = this.idle.pop() ?? this.spawn()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pht-8-bcryptjs-async-on-the-event-loop: every job runs as bcryptjs async on the event loop')
