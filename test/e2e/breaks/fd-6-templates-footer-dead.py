# The footer keeps the words and loses the destination — the dead control, in a footer.
# Reddens: folder-dialog: it lands on the Template Center rather than being a label
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '        data-testid="create-footer-templates"\n        onClick={() => go(\'/app/$workspaceId/templates\')}\n'
b = '        data-testid="create-footer-templates"\n        onClick={() => { /* label */ }}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The footer keeps the words and loses the destination — the dead control, in a footer.')
