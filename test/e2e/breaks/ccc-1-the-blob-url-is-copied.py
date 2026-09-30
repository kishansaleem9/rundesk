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
# IT REDDENS EIGHT, NOT THE THREE PREDICTED, and the cascade is honest: with
# nothing uploaded, every later check that reads a presign count, a PUT count,
# a share call or a task description has nothing to read. "Presign 0×, PUT 0×",
# "it asked to store undefined", the `blob:` clipboard, and no "Link copied"
# confirmation — and the second-clip and create-task checks go with them.
#
# Predicted three because I counted the copy path and not the five later checks
# that measure the same counters. Third time in this session I have counted one
# code path and not its readers; the other two were `lus-1` and `td-1`.
#
# NINE, re-run on lane 4 on 29 September (`resume-defects/resume-7`): the
# failed-attach check, added since, deletes the clip the Copy link uploaded,
# and with nothing uploaded there is nothing to delete.
#
# Reddens: clip-created-card: "and puts the SHARED url on the clipboard, not the blob: one"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = """  const copyClipLink = async () => {
    const url = await busy(ensureLink)
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
