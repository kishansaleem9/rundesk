# Brain’s replies are not marked as Brain’s.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "picked, it writes @Brain; posted, the thread shows Brain answering and then its reply, marked as Brain’s"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = 'const isBrainAuthor = (author?: { email?: string | null } | null) => author?.email === BRAIN_EMAIL\n'
b = "const isBrainAuthor = (author?: { email?: string | null } | null) => !author && BRAIN_EMAIL === ''\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-31-brain-replies-unmarked: Brain’s replies are not marked as Brain’s.')
