# A CLIP IN A COMMENT HAS NO COPY LINK, as before.
# (`found-30-sep/comment-clips-have-no-copy-link`, batch 19)
# Reddens: clip-created-card: "and the card's Copy link copies the comment's link, which opens on the clip"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = ('                {commentId && (\n'
     '                  <button\n'
     '                    type="button"\n'
     '                    onClick={copyClipLink}\n')
b = ('                {false && commentId && ( /* BROKEN: the clip card has no Copy link */\n'
     '                  <button\n'
     '                    type="button"\n'
     '                    onClick={copyClipLink}\n')
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccc-11-the-clip-card-has-no-copy-link: the clip card offers no Copy link')
