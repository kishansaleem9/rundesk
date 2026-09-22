# Pressing Enter creates the tag and does not put it on the task.
#
# HALF THE INTERACTION, and the half you cannot see from the tag box. The label
# row is created, the popover clears and refocuses, the filter list refreshes
# and the new tag is right there in it — so the box behaves exactly as it
# should. What does not happen is the attach, so the task you were tagging
# carries nothing.
#
# The plausible route is the mutation's own comment read as a description of
# what the server does rather than of what these two calls do: "The server
# returns the existing row for a name it already has… so pressing Enter on a
# tag you already made attaches it rather than failing on the unique index."
# Somebody can take that to mean the POST to `/labels` is the attach.
#
# And `onTask.has(label.id)` makes the deletion look like a guard doing its job
# — the condition reads as "skip the attach when it is already on", so removing
# the body and keeping the check is a shape that appears in real diffs.
#
# PREDICTED THREE AND IT REDDENED SIX, and every one of the three extra is
# honest rather than a miscount. #147 was labels, assignments and both
# endpoints shipping long ago with nothing in the web app ever calling them,
# and an HTTP check for "can a tag be attached" was already true and told
# nobody anything. Here:
#
#  - the two that read the server and the one that reads the sheet fall, as
#    predicted;
#  - `reusing the same name returns the same tag` and `so a second task can
#    carry the same tag` fall too, because both compare against `applied` —
#    the label the broken path never attached — so they are checks coupled to
#    the outcome of the thing under test rather than to the API they name;
#  - and the two guarded checks report as failed with the reason, which is the
#    guard doing its job: before it, `applied.id` threw and they simply did not
#    run.
#
# `a name that does not exist offers to create it` still passes.
#
# Reddens: task-depth: "pressing Enter creates the tag AND puts it on the task"
#   and "and the tag is visible on the task" and
#   "the badge carries its own remove control" and
#   "and pressing it takes the tag off" and
#   "reusing the same name returns the same tag" and
#   "so a second task can carry the same tag"
import io
p = '/home/user/rundesk/apps/web/src/components/task-tags.tsx'
a = """      if (!onTask.has(label.id)) {
        await api(`/tasks/${taskId}/labels/${label.id}`, { method: 'POST' })
      }
      return label
"""
b = """      return label
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-tags.tsx: Enter creates the tag and attaches it to nothing.')
