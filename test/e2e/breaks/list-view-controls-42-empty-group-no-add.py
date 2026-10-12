# ONLY GROUPS THAT ALREADY HAVE SOMETHING IN THEM.
#
# The frame's empty `TO DO 0` group carries `+ Add Task`, and that is the case
# you most want it in — an empty group is the one you are about to fill. Gated
# on the group having rows, the control is present everywhere a screenshot
# would look at it and missing exactly where it matters.
#
# Reddens list-view-controls: "each one carries exactly one add control" and
# "including a group with nothing in it, which is the frame's `TO DO 0`".
#
# Reddens: list-view-controls: "an empty group offered no way to add to it — the case you most want it in"
#
# Re-aimed 12 October: the add row already sits inside a condition (not in a
# status only a task added from another list has), so the gate joins it. Same break.
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """                {!homeOnly && (
                  <InlineAddTask
                    status={status}"""
b = """                {!homeOnly && groupTasks.length > 0 && (
                  <InlineAddTask
                    status={status}"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('$listId.tsx: an empty status group no longer offers + Add Task.')
