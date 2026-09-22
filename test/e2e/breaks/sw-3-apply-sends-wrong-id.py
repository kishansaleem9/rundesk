# Every card applies the first template — a grid of buttons that all do one thing.
# Reddens: space-wizard: "pressing Use applies THAT template, by id"
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = '                  onClick={() => applyTemplate.mutate(tpl.id)}\n'
b = '                  onClick={() => applyTemplate.mutate(spaceTemplates[0].id)}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: Every card applies the first template — a grid of buttons that all do one thing.')
