# The duplicate-name check goes back to comparing verbatim, so "Marketing" and
# "marketing" stop being the same name to the SERVICE.
#
# IT RAN GREEN THE FIRST TIME, and the reason is the third instance of one
# shape in a single session. The 409 has two sources: `assertListNameFree`
# raises one carrying frame `08:50`'s sentence, and the partial unique index on
# `lower(name)` raises a Postgres 23505 that `AllExceptionsFilter` maps to 409
# with the generic "That resource already exists". Making the service check
# case-sensitive does not let the duplicate through — the index still stops it —
# it only changes WHICH sentence the person reads.
#
# The service's own comment says that is the whole point of it existing: "This
# check exists so the ANSWER is a 409 with the frame's words rather than a bare
# Postgres unique-violation surfacing as a 500."
#
# So the suite gained a check that reads the words, and this patch reddens that
# one. The plain "case does not get around it" check stays green under it,
# correctly: case really does not get around it.
#
# Reddens: list-name-taken: "and says so in the frame's words, not the database's"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = '          sql`lower(${lists.name}) = lower(${trimmed})`,\n'
b = '          eq(lists.name, trimmed),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lists.service.ts: the service duplicate-name check is case sensitive; the index still is not.')
