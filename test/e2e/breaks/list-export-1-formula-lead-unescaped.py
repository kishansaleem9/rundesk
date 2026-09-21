# The formula guard removed from CSV cells. A task titled `=HYPERLINK("http://…")`
# or `=cmd|'/c calc'!A1` is written straight into the file, and Excel,
# LibreOffice and Google Sheets all execute it when somebody opens the export.
# The person who typed it never attacked anything — they typed it into a task
# title in an app that invited them to.
#
# Reddens: list-export: "a task named like a formula is exported as text"
import io
p = '/home/user/rundesk/apps/api/src/common/export/csv.ts'
a = "  if (FORMULA_LEAD.test(text)) text = `'${text}`\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('csv.ts: a cell beginning = + - @ is written as a formula.')
