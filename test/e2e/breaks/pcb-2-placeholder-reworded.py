# The placeholder becomes a generic "Search…". The bar still opens the palette;
# it just stops promising the three things frame `14:45` promises.
# Reddens: planner-command-bar: "reading \"Search events, teammates, commands…\", the frame's own three promises"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = '  \'planner.commandBar\': "Search events, teammates, commands…",\n'
b = '  \'planner.commandBar\': "Search…",\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('catalogs.ts: the command bar placeholder no longer matches the frame.')
