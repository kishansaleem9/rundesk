# CLOSING THE TASK LEAVES THE DOCK POINTED AT IT.
#
# The sheet closes and the dock goes on saying "This task: …" over a list page
# with no task open, and every turn after it goes on naming a task the reader
# has put away. The pointing was meant to last exactly as long as the task is
# on screen; this makes it last until somebody closes the dock.
#
# Reddens: brain-entry-points: "closing the task leaves the dock open and hands it back to the page: the chip naming the task is gone"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """  useEffect(() => {
    if (!open || !releaseDock) return
    return () => releaseDock()
  }, [open, releaseDock])
"""
b = """  useEffect(() => {
    if (!open || !releaseDock) return
    return undefined
  }, [open, releaseDock])
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: closing the task no longer hands the dock back to the page.')
