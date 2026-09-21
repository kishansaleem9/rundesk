# One sentence for every candidate. The pick has a reason, the runner-up has a reason,
# they are the same reason — a label rather than a justification, and "a reason is
# present" passes on it exactly as "a label is present" passed on the VIEW_LABEL bug.
# Reddens: ai-assign: "with a runner-up, whose reason is a different sentence about a different person"
#          ai-assign: "and giving the count the choice was made from, in the sentence"
#          unit: ai-assign.test.ts "and differs from the runner-up's, because they are different people"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-assign.ts'
a = "  return `${c.displayName || c.email}: ${parts.join(', ')}.`"
b = "  return 'Best available match for this task.'"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-assign.ts: every candidate now carries the same reason sentence.')
