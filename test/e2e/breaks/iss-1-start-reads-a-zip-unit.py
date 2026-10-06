# STARTING AN IMPORT READS A ZIP AS TEXT (`found-5-oct/xlsx-read-as-text`): its job row is written.
# RE-AIMED 6 October: the start asks for text before it asks whether the file is empty (`found-6-oct/import-start-answers-500-to-non-text`); the mistake is the same.
# Reddens: unit: spreadsheet-import.service.test.ts "an .xlsx read as text is refused in the page’s words, and no job row is written (found-5-oct/xlsx-read-as-text)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    this.assertDelimitedText(dto.content)\n    if (!dto.content.trim()) throw new BadRequestException('The uploaded file is empty.')\n"
b = "    if (!dto.content.trim()) throw new BadRequestException('The uploaded file is empty.')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("iss-1-start-reads-a-zip-unit: the import start reads a zip")
