# A MERGE OF STATUS ALONE ASKS EDIT, WHERE PATCH ASKS AN ASSIGNEE COMMENT (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`).
# Reddens: unit: import-access.test.ts "a merge of status alone, or of status and assignees, asks the comment level, as PATCH and the assignee routes ask it"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  for (const field of fields) if (!COMMENT_LEVEL_FIELDS.has(field)) return 'edit'\n  return 'comment'\n"
b = "  for (const field of fields) if (!COMMENT_LEVEL_FIELDS.has(field)) return 'edit'\n  return 'edit'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iac-3-a-status-merge-asks-edit-unit: every merge asks the edit level')
