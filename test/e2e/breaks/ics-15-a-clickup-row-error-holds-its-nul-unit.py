# A CLICKUP ROW'S ERROR IS STORED WITH ITS NUL.
# Reddens: unit: clickup-import.service.test.ts "a row the database refuses fails alone, and its error is stored without a NUL the database would refuse"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = '          result: storable(summary) as unknown as Record<string, unknown>,\n'
b = '          result: summary as unknown as Record<string, unknown>,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ics-15-a-clickup-row-error-holds-its-nul-unit: a row's error is stored with its NUL")
