# The standup hands the model an empty week, whatever the person did.
#
# `generateStandup(data)` is the one place a standup's rows reach a model.
# Handed empty buckets, a model writes a fluent paragraph about nothing, while
# the API still returns the true rows beside it, so every bucket check stays
# green. Only a check of what the model was SENT can tell. The lane's stub
# records the call, and the finished task's title is not in it
# (`found-29-sep/standup-check-reads-the-stubs-words`). Before that check, the
# suite read the reply's length, which on a lane is the stub's own sentence, so
# this patch and the true product read the same.
#
# Reddens only where a model answers: without one, no call reaches a model to be read.
# Reddens: person-panel: "and the sentence was written from real work, not from an empty week"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = "    const text = await this.ai.generateStandup(data, { userId: requesterId, workspaceId })\n"
b = "    const text = await this.ai.generateStandup({ ...data, done: [], active: [], overdue: [], blocked: [] }, { userId: requesterId, workspaceId })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('people.service.ts: the standup hands the model an empty week.')
