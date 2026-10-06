# THE CUSTOM REPORT'S PDF ROUTE RETURNS ITS BARE BUFFER: the button saves a .pdf full of JSON.
# RE-AIMED 6 October: the PDF is named after its report (`found-30-sep/export-names-worked-out-twice`).
# Reddens: file-exports: "Reports → custom → Export PDF saves a .pdf that begins %PDF-"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/reports.controller.ts'
a = "    return new StreamableFile(buffer, {\n      type: 'application/pdf',\n      // Named once, here, after the report: the report builder worked a name of its own out (`found-30-sep/export-names-worked-out-twice`).\n      disposition: downloadName(body?.name, '.pdf', 'rundesk-report').disposition,\n    })\n"
b = '    return buffer as unknown as StreamableFile\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fex-7-custom-pdf-sends-a-buffer: applied")
