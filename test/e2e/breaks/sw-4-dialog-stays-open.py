# The wizard sits there over a Space that now exists, inviting a second one.
# Reddens: space-wizard: "the wizard closes on success"
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = '      onOpenChange(false)\n      onCreated?.(made.space)\n'
b = '      onCreated?.(made.space)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: The wizard sits there over a Space that now exists, inviting a second one.')
