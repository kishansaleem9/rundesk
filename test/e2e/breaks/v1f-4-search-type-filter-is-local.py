# The search's Task type filter narrows nothing: it is read back into the form
# and never put on the request.
#
# THE OTHER HALF OF THE SAME PAIR, on the read side. The control renders, the
# types are listed, choosing one lights it up, and the chip survives being
# reopened — `setTaskTypeFilter((f.taskTypeId as string) ?? '')` is untouched,
# so the filter round-trips through the saved-filter shape and looks stored.
# Only the line that turns it into a query parameter goes, and it is one of
# fifteen `if (x) params.set(...)` lines that all look alike.
#
# The results then come back unfiltered, which is the worst shape for this: the
# person has told the app what they are looking for, the UI agrees that it
# heard, and the list they read is everything. A filter that returns too much
# is harder to notice than one that returns nothing.
#
# One check. `search offers a Task type filter` passes — the control is what it
# always was — and the suite catches the rest by reading the URL it asked the
# server for, which is the only place the difference exists.
#
# Reddens: video1-fast-items: "and choosing one narrows the search request"
import io
p = '/home/user/rundesk/apps/web/src/components/command-palette.tsx'
a = """      if (taskTypeFilter) params.set('taskTypeId', taskTypeFilter)
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('command-palette.tsx: the task-type filter never reaches the search request.')
