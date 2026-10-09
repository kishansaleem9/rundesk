# OPENED ON NO TASK, THE DOCK'S DOWNLOAD SAVES NOTHING.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "and opened on no task, its Download saves the picture made — a PNG named after its description, its very bytes — and puts it on no task"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!scope) {\n      saveFiles(files)\n      return\n    }\n',
     '    if (!scope) {\n      void saveFiles // BROKEN: nothing saved\n      return\n    }\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-w8-the-dock-saves-nothing: the dock saves nothing')
