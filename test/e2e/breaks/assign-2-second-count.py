# A SECOND OPINION about how much work somebody has. The suggestion stops reading
# `collectWorkloadLoads` and counts for itself; the number drifts from the one the
# §7.12 workload panel shows, and the two features start recommending opposite things
# about the same person on the same afternoon. The duplicated-list defect, in
# arithmetic — and invisible from either endpoint alone.
# Reddens: ai-assign: "the suggestion's open-task count matches what the workload endpoint reports for the same person"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "        openTasks: openBy.get(m.userId) ?? 0,"
b = "        openTasks: (openBy.get(m.userId) ?? 0) + (inListBy.get(m.userId) ?? 0),"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: the suggestion now keeps its own open-task count, drifting from workload-balance.')
