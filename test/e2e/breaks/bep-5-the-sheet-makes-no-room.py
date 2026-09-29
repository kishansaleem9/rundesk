# THE DOCK IS LIFTED OVER THE SHEET, AND THE SHEET DOES NOT MOVE OVER FOR IT.
#
# The other half of "beside": with the dock above the sheet and the sheet
# still flush right, the dock covers the sheet's right 380px — which is where
# its header keeps its controls, the ⋯ menu among them. The dock works; the
# task under it has lost a third of its width to it.
#
# Reddens: brain-entry-points: "and the dock stands beside the task, not under it: a press on its chip reaches the chip, the sheet’s own Brain² is still within reach, and the sheet ends where the dock begins"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """
          dockBeside && 'md:right-[380px]',
"""
b = """
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the sheet stays flush right under the dock beside it.')
