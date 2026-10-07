# A MOVED BLOCK LEAVES ITS EVENT where it was (`found-25-sep/connected-calendars-read-by-nothing`).
#
# Reddens: connected-calendars:
#   "and moving the block moves that event, and deleting the block deletes it"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '      .where(eq(taskTimeBlocks.id, blockId))\n      .returning()\n    return { ...row, ...(await this.toCalendar(row)) }\n'
b = '      .where(eq(taskTimeBlocks.id, blockId))\n      .returning()\n    return row\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ccl-6-a-moved-block-leaves-its-event: a moved block leaves its event where it was (`found-25-sep/connected-calendars-read-by-nothing`)')
