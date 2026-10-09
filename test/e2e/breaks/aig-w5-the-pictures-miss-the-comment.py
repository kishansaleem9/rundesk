# THE PICTURES ADDED NEVER REACH THE COMMENT.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "only the one left chosen is posted on the comment — the first picture, as a PNG of its very bytes, named after its description"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                    setCommentFiles((prev) => [...prev, ...files])\n                    setAiOpen(false)\n',
     '                    void files // BROKEN: not added\n                    setAiOpen(false)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-w5-the-pictures-miss-the-comment: the pictures miss the comment')
