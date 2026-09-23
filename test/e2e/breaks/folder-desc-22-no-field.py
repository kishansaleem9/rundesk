# THE FIELD ITSELF, removed. Frame `08:25` draws Description as the dialog's
# second row; without it a folder can only ever be created nameless of purpose,
# from the one dialog the frame shows the box in.
# Reddens: folder-dialog: "the Create Folder dialog has a Description field"
import io, re
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "        data-testid=\"quick-create-folder-description\"\n"
b = "        data-testid=\"quick-create-folder-description-REMOVED\"\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the Description box is no longer reachable — the frame\'s second row is gone.')
