# A LIST THAT FAILED READS AS AN EMPTY ONE.
# Reddens: webhook-access: "a list that fails says so — and not that there are none"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '        ) : whQuery.isError ? (\n'
b = '        ) : false ? (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-11-settings-failure-reads-as-none: applied")
