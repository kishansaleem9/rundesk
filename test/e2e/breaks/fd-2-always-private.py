# Every folder is privatised whether or not it was asked for — the same defect with the opposite sign.
# Reddens: folder-dialog: "with the toggle off nothing follows it"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '      if (isPrivate && folder?.id) {\n'
b = '      if (folder?.id) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: Every folder is privatised whether or not it was asked for — the same defect with the opposite sign.')
