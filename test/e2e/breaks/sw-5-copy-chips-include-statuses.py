# A Statuses chip joins the bar — the frame's fourth chip, over a create body that has no statuses parameter.
# Reddens: space-wizard: "the bar offers the two parts Rundesk can really copy"
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = "const COPYABLE = ['views', 'features'] as const\n"
b = "const COPYABLE = ['views', 'features', 'statuses'] as const\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("create-space-wizard.tsx: A Statuses chip joins the bar — the frame's fourth chip, over a create body that has no statuses parameter.")
