# Copy link puts the object URL on the clipboard instead of uploading first.
#
# The suite's header calls this "the neatest facade available in this whole
# audit, because it would even paste." A just-recorded clip is a Blob behind an
# object URL, private to the document that made it — so `blob:http://…/uuid`
# goes on the clipboard, pastes into Slack looking exactly like a link, and
# resolves for nobody, including the person who copied it once they close the
# tab.
#
# Everything reports success. The toast says "Link copied", because it was; the
# clipboard is not empty; there is no error to notice. The only way to know is
# to read what landed on the clipboard and see that it starts `blob:`, which is
# what the check does.
#
# `finished.url` is in scope two lines away and is the URL the inline player
# already uses, so "we have a url right here" is a very short reasoning path.
#
# REDDENS THREE, AND THEY ARE THE THREE ABOUT UPLOADING: the clip is never
# presigned or PUT, so "pressing it uploads the clip — once" fails, "as a
# video, not as whatever" has no presign body to read, and the clipboard check
# fails on the `blob:` prefix. The card, the heading and the three buttons are
# untouched.
#
# Reddens: clip-created-card: "and puts the SHARED url on the clipboard, not the blob: one"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = """  const copyClipLink = async () => {
    const url = await ensureLink()
    if (!url) return
"""
b = """  const copyClipLink = async () => {
    const url = finished?.url ?? null
    if (!url) return
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('comment-recorder.tsx: Copy link now copies the blob: url.')
