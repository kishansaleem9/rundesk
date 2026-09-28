# The views panel goes back to one tab, which is what Rundesk drew before this row.
# Reddens: space-wizard: "the panel is tabbed Required views | Default View Templates, as the frame draws"
import io
p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = "          {(['required', 'templates'] as const).map((tab) => (\n"
b = "          {(['required'] as const).map((tab) => (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-space-wizard.tsx: The views panel goes back to one tab, which is what Rundesk drew before this row.')
