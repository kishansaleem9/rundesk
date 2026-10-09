# A SENT EMAIL IS DRAWN AS A PLAIN COMMENT.
# (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`)
# Reddens: comment-email: "the thread draws it as an email — whom it went to, copied and blind-copied, and its subject — and the box is a comment box again"
#
# The thread shows its words and not that it went by email, to whom, or with what subject.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                {c.email && <CommentEmailEnvelope commentId={c.id} email={c.email} />}\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cem-w3-the-thread-draws-no-envelope: A SENT EMAIL IS DRAWN AS A PLAIN COMMENT.')
