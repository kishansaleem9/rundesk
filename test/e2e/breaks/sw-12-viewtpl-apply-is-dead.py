# Applying a view set changes nothing underneath it — a tab of buttons over nothing.
# Reddens: space-wizard: "applying a view set moves the switches underneath it — Project brings Gantt on, and Marketing moves them "
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = '                    onClick={() => {\n                      setViews([...p.views])\n                      setDefaultView(p.defaultView)\n                    }}\n'
b = '                    onClick={() => { /* dead */ }}\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: Applying a view set changes nothing underneath it — a tab of buttons over nothing.')
