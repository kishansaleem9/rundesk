# A PUSH WRITES INTO EVERY CONNECTION OF THE WORKSPACE, WHOEVER OWNS IT, as it did.
# Reddens: unit: calendar-sync.service.test.ts "writes into the connection whose owner may read the task, and not into the one whose owner may not"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
a = '      if (!(await this.ownerMayRead(conn, ctx.task))) continue\n'
b = '      void this.ownerMayRead\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cps-1-every-connection-is-written-unit: every connection is written to')
