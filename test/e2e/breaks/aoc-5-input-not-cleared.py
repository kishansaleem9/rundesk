# The file input keeps its value, so re-picking a file you removed fires no change event and the row never returns.
# Reddens: attach-on-create: re-picking a file that was removed brings its row back
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "              addAttachments(e.target.files)\n              // Clear the input, or picking the SAME file after removing it\n              // fires no change event and the row never comes back.\n              e.target.value = ''\n"
b = '              addAttachments(e.target.files)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: The file input keeps its value, so re-picking a file you removed fires no change event and the row never returns.')
