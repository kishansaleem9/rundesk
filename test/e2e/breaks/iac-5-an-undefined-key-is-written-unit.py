# A MERGE IS SAID TO WRITE A FIELD IT LEAVES OUT (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`): a key whose
# value is undefined is counted, so a status merge of a ClickUp file asks edit for a description it does not write.
# Reddens: unit: import-access.test.ts "names the columns a merge writes, and not a key whose value is undefined, which the update leaves out"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
s = io.open(p, encoding='utf-8').read()
a = '  return Object.keys(set).filter((key) => set[key] !== undefined)\n'
b = '  return Object.keys(set)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iac-5-an-undefined-key-is-written-unit: every key of a merge set is counted as written')
