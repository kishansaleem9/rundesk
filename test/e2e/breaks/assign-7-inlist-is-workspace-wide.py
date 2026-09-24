# The "already working in this list" number stops being about this list. Context
# becomes a second copy of load, the two dimensions collapse into one, and a person
# who has never touched this list reads as being deep in it.
# Reddens: ai-assign: "the candidate's in-this-list count is the one task this run put there"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
# Re-anchored when the count took its asker's view (`actorSees`,
# found-24-sep/ai-suggestions-read-the-whole-workspace); the edit is the same:
# the list condition goes.
a = "        .where(and(eq(tasks.listId, row.listId), eq(tasks.isArchived, false), ne(tasks.statusCategory, 'closed'), actorSees))"
b = "        .where(and(eq(tasks.isArchived, false), ne(tasks.statusCategory, 'closed'), actorSees))"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: inList now counts every open task anywhere, not just this list.')
