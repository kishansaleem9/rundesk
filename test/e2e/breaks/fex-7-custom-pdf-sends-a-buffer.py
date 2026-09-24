# THE CUSTOM REPORT'S PDF ROUTE RETURNS ITS BARE BUFFER: the button saves a .pdf full of JSON.
# Reddens: file-exports: "Reports → custom → Export PDF saves a .pdf that begins %PDF-"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/reports.controller.ts'
a = "    return new StreamableFile(buffer, {\n      type: 'application/pdf',\n      disposition: 'attachment; filename=\"rundesk-report.pdf\"',\n    })\n"
b = '    return buffer as unknown as StreamableFile\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fex-7-custom-pdf-sends-a-buffer: applied")
