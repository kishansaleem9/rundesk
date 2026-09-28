# THE FRAME'S WORDS, replaced with a house string. "Reply to comment…" is the
# one line saying what this composer answers, which is precisely what the page
# composer at the bottom of the list cannot say about itself.
# Reddens: comment-thread: "the composer carries the frame's own words, \"Reply to comment…\""
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = "  'taskDetail.threadReplyPlaceholder': 'Reply to comment…',"
b = "  'taskDetail.threadReplyPlaceholder': 'Write a reply',"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("catalogs.ts: the thread composer no longer says what it answers.")
