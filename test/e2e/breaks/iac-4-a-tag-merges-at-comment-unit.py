# A MERGE THAT TAGS A TASK ASKS ONLY COMMENT, WHERE THE TAG ROUTE ASKS EDIT (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`).
# Reddens: unit: import-access.test.ts "any other field it writes — a description, a priority, a date, a tag, a custom value — asks edit"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "const COMMENT_LEVEL_FIELDS = new Set(['status', 'statusCategory', 'assignees'])\n"
b = "const COMMENT_LEVEL_FIELDS = new Set(['status', 'statusCategory', 'assignees', 'tags'])\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iac-4-a-tag-merges-at-comment-unit: a tag is merged at the comment level')
