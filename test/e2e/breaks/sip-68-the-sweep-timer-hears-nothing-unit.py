# A SWEEP THAT FAILS IN THE TIMER IS A REJECTION NOBODY HEARS (`found-30-sep/an-open-socket-outlives-its-session`).
#
# The revoked-session sweep runs in a timer, and the timer catches what the
# sweep throws and says it. Drop the catch and a sweep that fails is a rejection
# nobody hears, which ends the process (Node's default) and every socket and
# request it holds. (Re-aimed twice: when the sweep came to ask each socket's
# rooms too, and when the sessions and the rooms each got their own sweep,
# `found-6-oct/an-open-socket-outlives-its-access`.)
#
# Reddens: unit: realtime.gateway.test.ts "the sweep’s timer hears a sweep that fails: no rejection is left to end the process"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '      this.sessionSweep = this.disconnectRevokedSockets()\n        .catch((err: unknown) =>\n          this.logger.warn(`revoked-session sweep failed: ${err instanceof Error ? err.message : String(err)}`),\n        )\n        .finally(() => {\n'
b = '      this.sessionSweep = this.disconnectRevokedSockets()\n        .finally(() => {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-68-the-sweep-timer-hears-nothing-unit: the timer no longer catches a failed session sweep')
