# Somebody already on the task stays in the running, so "who should take this" answers
# with the person who already has it. The feature never runs out of answers and never
# gives a useful one twice.
# Reddens: ai-assign: "assigning them removes them from the candidates — there is nothing to choose about someone who has it"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "      (m) => m.role !== 'guest' && !taken.has(m.userId),"
b = "      (m) => m.role !== 'guest',"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: people already on the task are candidates for it again.')
