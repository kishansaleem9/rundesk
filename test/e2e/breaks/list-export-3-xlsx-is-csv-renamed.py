# Excel export becomes CSV with a different extension and content type. The
# download arrives named .xlsx, the browser hands it to Excel, and Excel opens
# it anyway because it falls back to parsing text — so the defect surfaces as
# "the columns look odd sometimes" rather than as a failure.
#
# IT NAMED THE CHECK THAT READS THE ENVELOPE, NOT THE ONES THAT OPEN IT.
# "Excel comes back as a workbook, not as CSV with a new name" reads the
# content-type and the extension, which a renamed CSV satisfies perfectly — so
# it passed, correctly, and the four checks that actually PARSE the bytes went
# red without being claimed.
#
# That is the shape of the defect and of the check set together: a wrapper can
# lie about what is inside it, so one check asks what it says it is and four ask
# what it is. The patch reddens the second group.
#
# PREDICTED FOUR.
#
# Reddens: list-export: "the workbook opens and contains a worksheet part" and
#   "with the same columns the CSV has" and
#   "the formula-shaped title survives verbatim — no apostrophe is added" and
#   "and no cell in the sheet is a formula"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      body: format === 'xlsx' ? await toXlsx(name, headers, cells) : toCsv(headers, cells),\n"
b = "      body: toCsv(headers, cells),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: the xlsx export is a CSV with an xlsx name.')
