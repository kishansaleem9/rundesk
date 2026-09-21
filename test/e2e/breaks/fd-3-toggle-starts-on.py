# The dialog opens with privacy already on, so a folder made without touching it vanishes for everybody else.
# Reddens: folder-dialog: and it starts off
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '\n  const [isPrivate, setIsPrivate] = useState(false)\n'
b = '\n  const [isPrivate, setIsPrivate] = useState(true)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The dialog opens with privacy already on, so a folder made without touching it vanishes for everybody else.')
