# A TARGET SPACE NAMING NOTHING IS LET THROUGH (`found-5-oct/import-writes-into-another-workspace`).
# Reddens: unit: import-target.test.ts "an id naming nothing is 404 “Space not found”"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-target.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (!space) throw new NotFoundException('Space not found')\n"
b = "  if (!space) return\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("itg-2-a-missing-space-is-no-refusal-unit: a space naming nothing passes")
