# The Create Folder dialog loses the private toggle entirely — a folder could only ever be created public again.
# Reddens: folder-dialog: "the Create Folder dialog offers a Make private control"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '        <input\n          type="checkbox"\n          checked={isPrivate}\n          data-testid="quick-create-folder-private"\n          onChange={(e) => setIsPrivate(e.target.checked)}\n          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"\n        />\n'
b = '        <span />\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The Create Folder dialog loses the private toggle entirely — a folder could only ever be created public again.')
