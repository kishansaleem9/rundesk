# THE WIZARD OPENS ON EDIT, WHERE FRAME 06:52 SHOWS FULL EDIT.
# Reddens: full-edit-levels: "a space is Full edit unless told otherwise: made without a level it is `admin`, stored so, and the wizard opens on \"Full edit\""
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const [permission, setPermission] = useState('admin')"
b = "  const [permission, setPermission] = useState('edit')"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fel-2-wizard-preselects-edit: the wizard opens on edit, where frame 06:52 shows full edit')
