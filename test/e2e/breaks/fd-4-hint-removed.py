# The switch keeps its label and loses the sentence that says who still has access.
# Reddens: folder-dialog: "with the frame's own sentence under it, so what \"private\" means is on screen"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '          <span className="text-[11px] text-muted-foreground">{t(\'quickCreate.folderPrivateHint\')}</span>\n'
b = '          <span className="text-[11px] text-muted-foreground" />\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The switch keeps its label and loses the sentence that says who still has access.')
