# A CLICKUP MERGE'S SUBTASK LINKS ASK NOTHING (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`).
# Reddens: unit: clickup-import.service.test.ts "each subtask link asks the link rule, saying which of its tasks were already there: a refused link is reported in the rule’s words and not made (found-6-oct/import-merge-writes-tasks-its-importer-may-not-change)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '          await this.access.assertMayLinkSubtask(this.db, {\n'
b = '          if (false) await this.access.assertMayLinkSubtask(this.db, {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ics-8-clickup-links-ask-nothing-unit: the subtask pass asks no link rule')
