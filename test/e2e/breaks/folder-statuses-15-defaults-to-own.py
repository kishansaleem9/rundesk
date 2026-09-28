# Open the dialog on "Own statuses" instead of "Use Space statuses". The
# control still works; it just starts on the value the frame does not show, so
# every folder made by somebody who did not touch the row gets the opposite of
# what the product promises.
# Reddens: folder-dialog: "and it starts on Use Space statuses, which is the value the frame shows"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "const [statusScope, setStatusScope] = useState<'space' | 'list'>('space')"
b = "const [statusScope, setStatusScope] = useState<'space' | 'list'>('list')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the dialog now opens on "Own statuses" — the frame shows the other one.')
