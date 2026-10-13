# The picker’s Agents section has no "+ Create Agent".
# Reddens: brain-comments-and-decks: "the picker’s Agents section ends in frame 04:00’s "+ Create Agent", which opens a new Super Agent"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '                    data-testid="mention-agents-create"\n'
b = '                    data-testid="mention-agents-create-gone"\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-33-no-create-agent: The picker’s Agents section has no "+ Create Agent".')
