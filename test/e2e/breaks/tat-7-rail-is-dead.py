# A TOOLTIP OVER A DEAD CONTROL. The rail icon keeps its label and stops
# opening the panel -- the shape half the controls in this audit were found
# in.
# Reddens: task-attachments -- 'pressing it opens the one Related Items panel the tab already opens'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                    onClick={() => setActiveTab('dependencies')}"""
b = """                    onClick={() => {}}"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the Related Items rail icon is now wired to nothing.")
