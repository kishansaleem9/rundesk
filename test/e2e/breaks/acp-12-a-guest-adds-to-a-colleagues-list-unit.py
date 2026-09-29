# A GUEST PUTS TASKS ON A MEMBER'S PRIORITIES, asked of the service itself (`ledger-rows/row-850`).
# Reddens: unit: people.service.test.ts "refuses a guest (403) and writes nothing — ClickUp: guests cannot add to somebody else's priorities"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = """    if (callerRole === 'guest') {
      throw new ForbiddenException("A guest cannot add tasks to somebody else's priorities")
    }
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-12-a-guest-adds-to-a-colleagues-list-unit: a guest may add to anybody\'s priorities')
