# The toast's "Open Priorities" link goes to the workspace home instead of the
# Planner.
#
# The toast is right, the label is right, the write is right — and the one
# thing the link exists to do is to show you where the task went. The comment
# on the toast says why it is there at all: "'Added' with no way to look is a
# claim the reader has to take on trust." A link that lands somewhere the
# priorities are not is that claim with an extra click.
#
# `/app/${workspaceId}/calendar` → `/app/${workspaceId}` is a plausible
# truncation. The Planner lives at `/calendar`, which is not a name anybody
# guesses, and the workspace home is what every other "take me back" in this
# file navigates to.
#
# REDDENS THREE, AND THE CASCADE IS THE POINT RATHER THAN NOISE. "the link goes
# to the Planner" fails; the two checks after it read the Priorities rail,
# which does not exist on the workspace home, so they fail with '' — and that
# is what a wrong destination costs a person too. `readText` returns '' rather
# than throwing, so all three failures are named checks and the run reaches its
# last two.
#
# Reddens: assign-to-priorities: "the link goes to the Planner"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                  onClick: () => navigate({ to: `/app/${workspaceId}/calendar` }),"
b = "                  onClick: () => navigate({ to: `/app/${workspaceId}` }),"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: "Open Priorities" lands on the workspace home.')
