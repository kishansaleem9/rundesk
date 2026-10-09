# A CLIP'S LINK IN A TASK'S DESCRIPTION IS LEFT A BARE ADDRESS.
# (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`)
# Reddens: clip-link-embeds: "and in a task’s description, drawn under it — pressing its player plays it and opens no editor"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('            <ClipEmbeds tokens={clipTokensIn(detail.description, window.location.origin)} />\n',
     '            <ClipEmbeds tokens={clipTokensIn(detail.description, window.location.origin).slice(0, 0)} /> {/* BROKEN: the description draws no clip */}\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cme-w5-the-description-draws-no-clip: the description draws no clip')
