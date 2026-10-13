# The "+" menu offers no task, Doc or location.
# Reddens: brain-comments-and-decks: "the composer’s \"+\" offers a task, Doc or location to focus on and a file to upload, each shown as a chip on the next question"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = '                      data-testid="ai-plus-context"\n'
b = '                      data-testid="ai-plus-context-gone"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-19-the-plus-offers-no-focus: The "+" menu offers no task, Doc or location.')
