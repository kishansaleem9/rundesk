# THE DESCRIPTION'S CLIPS ARE DRAWN INSIDE WHAT OPENS ITS EDITOR: pressing play opens the editor.
# (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`)
# Reddens: clip-link-embeds: "and in a task’s description, drawn under it — pressing its player plays it and opens no editor"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('          <div data-testid="description-clips">\n',
     '          <div data-testid="description-clips" onClickCapture={() => { setDescriptionDraft(detail.description ?? \'\'); setEditingDescription(true) }}>\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cme-w6-pressing-play-opens-the-editor: pressing play opens the editor')
