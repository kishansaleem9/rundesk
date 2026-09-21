# The Help-centre link survives but points somewhere that is not the help
# page — clickable, plausible, and no use to the person reading the error.
# Reddens: "pointing at the help page",
#          "and it actually lands on a help page that renders".
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      to="/app/help"'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '      to="/app/profile"'))
print('[break 5] pointed the Help-centre link at /app/profile —')
print('          it still clicks, and it still goes nowhere useful.')
