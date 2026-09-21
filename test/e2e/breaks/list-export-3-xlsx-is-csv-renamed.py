# Excel export becomes CSV with a different extension and content type. The
# download arrives named .xlsx, the browser hands it to Excel, and Excel opens
# it anyway because it falls back to parsing text — so the defect surfaces as
# "the columns look odd sometimes" rather than as a failure.
#
# Reddens: list-export: "Excel comes back as a workbook, not as CSV with a new name"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      body: format === 'xlsx' ? toXlsx(name, headers, cells) : toCsv(headers, cells),\n"
b = "      body: toCsv(headers, cells),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: the xlsx export is a CSV with an xlsx name.')
