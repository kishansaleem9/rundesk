# Folder and list templates are offered from the Space dialog, so Use makes a container of the wrong kind.
# Reddens: space-wizard: lists ONLY the templates that make a Space
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = "    () => (templateRows ?? []).filter((tpl) => tpl.targetType === 'space'),\n"
b = '    () => (templateRows ?? []),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: Folder and list templates are offered from the Space dialog, so Use makes a container of the wrong kind.')
