# Only @Brain written so is answered; @brain is not.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "a member’s @brain, in any case, is answered too — and never from what that member may not read"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/brain-comments.ts'
a = 'export const BRAIN_MENTION = /(^|[^\\w@.])@brain(?![\\w-])/i'
b = 'export const BRAIN_MENTION = /(^|[^\\w@.])@Brain(?![\\w-])/'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-10-brain-case-sensitive: Only @Brain written so is answered; @brain is not.')
