# The staged files stop being drawn at all — chosen, invisible, and unremovable.
# Reddens: attach-on-create: "two files staged draw two rows"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '      {attachments.length > 0 && (\n        <div className="space-y-1.5" data-testid="quick-create-attachments">\n'
b = '      {false && attachments.length > 0 && (\n        <div className="space-y-1.5" data-testid="quick-create-attachments">\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The staged files stop being drawn at all — chosen, invisible, and unremovable.')
