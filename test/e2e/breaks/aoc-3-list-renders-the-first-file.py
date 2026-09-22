# Every row names files[0] — the list that photographs correctly and says one thing.
# Reddens: attach-on-create: "each row names ITS OWN file, in the order they were
#   picked"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '                <span className="min-w-0 truncate" data-testid={`quick-create-attachname-${i}`}>{file.name}</span>\n'
b = '                <span className="min-w-0 truncate" data-testid={`quick-create-attachname-${i}`}>{attachments[0].name}</span>\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: Every row names files[0] — the list that photographs correctly and says one thing.')
