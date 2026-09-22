# A SECOND OPINION about how much work somebody has. The suggestion stops reading
# `collectWorkloadLoads` and counts for itself; the number drifts from the one the
# §7.12 workload panel shows, and the two features start recommending opposite things
# about the same person on the same afternoon. The duplicated-list defect, in
# arithmetic — and invisible from either endpoint alone.
#
# IT CAME BACK GREEN, AND THE CHECK IT NAMED WAS NOT THE PROBLEM. This claimed
# "the suggestion's open-task count matches what the workload endpoint reports
# for the same person", which is precisely the right question — but that check
# stands where every candidate has `inList = 0`, because the subject's list is
# created by the run and nothing has been put in it yet. The check's own comment
# records its first run: "the suggestion said 0 and workload-balance said 0".
# This patch adds `inList` to the count, and against a fixture of zeroes
# `open + 0` is the same number. 23 passed, 0 failed: a patch reddening nothing,
# under a claim naming the one check written for exactly it.
#
# Two zeroes agreeing is not two sources agreeing. So the suite now asks the
# same question a second time, in the later section where `inList` is 1 — a
# value asserted on the line above it — and this claim names THAT check. The
# first one stays: it is the cheaper statement of the same guarantee, and it
# reddens for the patches that break the shared read outright.
#
# Reddens: ai-assign: "and the two counts still agree once that person has work in THIS list, where they could drift"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "        openTasks: openBy.get(m.userId) ?? 0,"
b = "        openTasks: (openBy.get(m.userId) ?? 0) + (inListBy.get(m.userId) ?? 0),"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: the suggestion now keeps its own open-task count, drifting from workload-balance.')
