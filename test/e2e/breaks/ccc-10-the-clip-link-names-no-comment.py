# A COMMENT CLIP’S COPY LINK NAMES NO COMMENT, so the link opens the task and not the clip.
# (`found-30-sep/comment-clips-have-no-copy-link`, batch 19)
# Reddens: clip-created-card: "and the card's Copy link copies the comment's link, which opens on the clip"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "    url.searchParams.set('comment', commentId)\n"
b = '    // BROKEN: the clip link names no comment\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccc-10-the-clip-link-names-no-comment: the clip link names no comment')
