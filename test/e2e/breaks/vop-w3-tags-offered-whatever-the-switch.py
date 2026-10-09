# THE SHEET OFFERS TAGS WHATEVER THE SWITCH: a tag added there is refused.
# (`found-25-sep/view-only-individual-permissions`)
# Reddens: view-only-permissions: "and the member’s sheet follows: Start timer and a manual entry again, no word that they may not track time, an estimate to type, and no tag to add"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                  mayChange={caps.tags ?? caps.edit}\n',
     '                  mayChange={true} // BROKEN: tags are offered whatever the switch\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('vop-w3-tags-offered-whatever-the-switch: tags are offered whatever the switch')
