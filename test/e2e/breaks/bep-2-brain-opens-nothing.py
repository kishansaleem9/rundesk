# BRAIN² IS DRAWN IN THE HEADER AND PRESSING IT DOES NOTHING.
#
# The cheapest version of the row: the frame's label, in the frame's place,
# over a handler that opens nothing. It photographs exactly like the real one,
# which is why the check presses it and looks for the dock rather than reading
# the header. Everything downstream of the dock fails with it.
#
# Reddens: brain-entry-points: "pressing Brain² opens the shell’s AI dock"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                      onClick={() =>
                        aiDock.scope?.id === detailQuery.data.id
                          ? aiDock.close()
                          : aiDock.openOn({ kind: 'task', id: detailQuery.data.id, title: detailQuery.data.title })
                      }
"""
b = """                      onClick={() => {}}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: Brain² in the task header does nothing when pressed.')
