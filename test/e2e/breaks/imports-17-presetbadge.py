# Check 17 — hardcode the report's preset badge. It can only ever say one thing,
# which is the definition of a facade.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-import-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              data-preset={result.sourcePreset}'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '              data-preset="generic"'))
print("BROKE check 17: the report's preset badge is hardcoded")
