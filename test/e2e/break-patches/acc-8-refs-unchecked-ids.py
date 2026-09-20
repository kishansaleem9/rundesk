# The uuid shape check dropped from the reference batch: a malformed id reaches a
# uuid column, Postgres refuses the query, and resolving the chips in an answer
# becomes a 500 for the whole answer.
# Reddens: ai-create-containers: "a malformed id is dropped rather than turned into a database error"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    if (isUuid(id)) seen.add(id)\n"
b = "    seen.add(id)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: /ai/refs now passes unvalidated ids straight into a uuid column.')
