# The @ picker has no Brain section.
# Reddens: brain-comments-and-decks: "the @ picker opens with frame 04:00’s Brain section — \"Brain² — Ask, Build, Create\" — above the people"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '              <div className="border-b border-border/70 px-1 py-1" data-testid="mention-brain-section">\n'
b = '              <div className="border-b border-border/70 px-1 py-1" data-testid="mention-brain-section-gone">\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-29-no-brain-in-the-picker: The @ picker has no Brain section.')
