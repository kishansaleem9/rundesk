# THE PREVIEW READS A ZIP AS TEXT (`found-5-oct/xlsx-read-as-text`): its bytes are drawn as a column.
# Reddens: unit: spreadsheet-import.service.test.ts "and its preview is refused the same way, before any column is drawn"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    this.assertDelimitedText(dto.content)\n    const table = parseSheet(dto.content ?? '', dto.delimiter)\n"
b = "    const table = parseSheet(dto.content ?? '', dto.delimiter)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("iss-2-preview-reads-a-zip-unit: the preview reads a zip")
