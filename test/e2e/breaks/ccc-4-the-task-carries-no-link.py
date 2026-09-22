# "Create a task" makes the task and leaves the clip out of it.
#
# `description: url` goes. The task is created, in the right list, with the
# clip's filename as its title, and the toast says so — and the clip it was
# made from is nowhere on it. The recording stays in storage, reachable by a
# signed URL nobody has, and the task is a title about a video you cannot get
# to.
#
# It is also the one action of the three whose failure leaves something behind
# to be confused by later. A Copy link that copies nothing is noticed in
# seconds; a task with no link is noticed next week by somebody else.
#
# The title carries the filename, so the row looks complete in every list view
# — which is why the check reads the task's DESCRIPTION out of the API and
# looks for the clip URL in it, rather than asking whether a task appeared.
#
# `ensureLink()` is still called and still awaited, so the upload happens and
# every counter the suite watches is unchanged. Only the task is empty.
#
# ONE CHECK. The three copy checks, the upload counts and the second-clip check
# are all untouched.
#
# Reddens: clip-created-card: "Create a task really makes one, in this list, carrying the clip link"
import io
p = '/home/user/rundesk/apps/web/src/components/comment-recorder.tsx'
a = """          title: finished?.file.name ?? t('clipCreated.title'),
          listId,
          description: url,
"""
b = """          title: finished?.file.name ?? t('clipCreated.title'),
          listId,
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('comment-recorder.tsx: the task created from a clip carries no link to it.')
