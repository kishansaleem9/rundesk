# Every Use button applies the FIRST view set, whatever card it sits on: the
# facade that a count check and a per-card label both survive, because the cards
# still read right — only what they DO is one shared answer.
# Reddens: space-wizard: "applying a view set moves the switches underneath it — Project brings Gantt on, and Marketing moves them "
import io

p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = "                      setViews([...p.views])\n                      setDefaultView(p.defaultView)"
b = "                      setViews([...presets[0].views])\n                      setDefaultView(presets[0].defaultView)"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: every view-set card now applies the first set.')
