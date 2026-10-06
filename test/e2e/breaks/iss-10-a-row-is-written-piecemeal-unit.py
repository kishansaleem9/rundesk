# A ROW IS WRITTEN PIECE BY PIECE (`found-5-oct/xlsx-read-as-text`): its task is kept when a tag of it cannot be linked.
# Reddens: unit: spreadsheet-import.service.test.ts "a row’s writes are one: a row whose tag cannot be linked leaves no task and no tag behind"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '              const taskId = await this.db.transaction(async (tx) => {\n'
b = '              const taskId = await (async (tx: Writer) => {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = '                return task.id\n              })\n'
b = '                return task.id\n              })(this.db)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iss-10-a-row-is-written-piecemeal-unit: a row is written outside a transaction of its own')
