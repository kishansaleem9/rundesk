# THE ROW LIMIT RAISED PAST WHAT WAS MEASURED: a file one row past 100,000 is read, not refused.
# Reddens: clickup-current-export: "a file one row past 100,000 is refused by the page, in the limit’s own words"
import io
p = '/home/user/rundesk/packages/imports/src/table.ts'
a = 'export const MAX_SHEET_ROWS = 100_000'
b = 'export const MAX_SHEET_ROWS = 200_000'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cce-1-the-limit-is-200000: applied")
