# The X on one row throws away every staged file, not the one it sits on.
# Reddens: attach-on-create: removing the first row leaves exactly the other file
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '                  onClick={() => setAttachments((prev) => prev.filter((_, at) => at !== i))}\n'
b = '                  onClick={() => setAttachments([])}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The X on one row throws away every staged file, not the one it sits on.')
