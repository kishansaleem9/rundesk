# The service's visibility validation removed, leaving only migration 0134's
# CHECK constraint.
#
# THE VALUE IS STILL REFUSED — `AllExceptionsFilter` maps the 23514 to a 400 —
# so a status-only assertion sees nothing. What is lost is the sentence:
# `Unknown view visibility "everybody"` becomes "A value failed a database
# constraint", and somebody who sent four fields is left guessing which one was
# wrong.
#
# The third suite where this shape was looked for on purpose rather than tripped
# over, after `list-name-taken` (409 from a unique index) and `ai-value` (400
# from a bounds CHECK). The inventory that found it is every `CHECK (` in
# packages/db/src/migrations paired with the service check that exists to give
# it a human sentence.
#
# Reddens: view-visibility: "and the refusal names the value it would not take"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = """    if (data.visibility !== undefined && !VISIBILITIES.includes(data.visibility)) {
      throw new BadRequestException(`Unknown view visibility "${data.visibility}"`)
    }
"""
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('views.service.ts: only the database rejects an unknown visibility now.')
