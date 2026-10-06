# A CLICKUP ROW'S ERROR IS STORED WITH ITS NUL, which the job's jsonb refuses: the whole run fails at its last write.
# Reddens: imports: "a ClickUp row holding a NUL fails alone: the job completes with the rows around it imported, and that row’s error is reported without the NUL"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = '          result: storable(summary) as unknown as Record<string, unknown>,\n'
b = '          result: summary as unknown as Record<string, unknown>,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("imports-72-a-clickup-row-error-holds-its-nul: a row's error is stored with its NUL")
