# THE CLICKUP START TRIMS A BODY THAT IS NO TEXT, a TypeError.
# Reddens: unit: clickup-import.service.test.ts "refuses a preview and an import of a body that is no text, in the page’s words"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
a = "    if (typeof dto.csv !== 'string') throw new BadRequestException(NOT_DELIMITED_TEXT)\n    if (!dto.csv.trim()) throw new BadRequestException('CSV body is empty')\n"
b = "    if (!dto.csv.trim()) throw new BadRequestException('CSV body is empty')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ics-13-the-clickup-start-takes-no-text-unit: the ClickUp start takes no text')
