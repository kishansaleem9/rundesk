# A TOKEN THE PROVIDER REFUSES IS GIVEN UP ON, never refreshed and asked again (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: unit: calendar-accounts.service.test.ts "a token the provider refuses is refreshed once and the read asked again, not given up on"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-accounts.service.ts'
a = '      const again = await this.tokenFor(account, true)\n'
b = '      const again = null as string | null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccl-15-a-refused-token-is-given-up-unit: a token the provider refuses is given up on, never refreshed and asked again (`found-25-sep/connected-calendars-read-by-nothing`)')
