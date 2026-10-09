# A CLIP'S LINK IN A TASK'S COMMENT IS LEFT A BARE ADDRESS.
# (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`)
# Reddens: clip-link-embeds: "and the same link in a task’s comment is drawn as the clip under the comment"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                <ClipEmbeds tokens={clipTokensIn(c.body, window.location.origin)} />\n',
     '                <ClipEmbeds tokens={clipTokensIn(c.body, window.location.origin).slice(0, 0)} /> {/* BROKEN: comments draw no clip */}\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cme-w2-comments-draw-no-clip: comments draw no clip')
