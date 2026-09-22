# One sentence for every candidate. The pick has a reason, the runner-up has a reason,
# they are the same reason — a label rather than a justification, and "a reason is
# present" passes on it exactly as "a label is present" passed on the VIEW_LABEL bug.
# THE CHECK IT REDDENS WAS RE-WORDED, and for a reason worth knowing: it used to
# compare the two reason STRINGS, and two members who share a display name get
# the same sentence from `explainCandidate` — which is what a workspace with two
# users called "Cal Peer" in it did to the baseline. It asserts the pair of facts
# a shared label really breaks now: the reason NAMES the runner-up and carries
# THEIR count. This patch's constant sentence contains neither.
#
# Reddens: ai-assign: "with a runner-up whose reason names the runner-up and
#   carries their own count"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-assign.ts'
a = "  return `${c.displayName || c.email}: ${parts.join(', ')}.`"
b = "  return 'Best available match for this task.'"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-assign.ts: every candidate now carries the same reason sentence.')
