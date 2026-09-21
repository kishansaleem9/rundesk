# The task's picker offers the list route's six types instead of all nineteen —
# the exact duplicated-list drift this codebase already shipped once, where
# each picker is individually plausible and nobody compares them.
# Reddens: task-field-create — "the type picker offers all 19 field types",
#          "including the five that only the long list has"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "const CREATABLE_TYPES_FROM_LABELS = Object.keys(FIELD_TYPE_LABEL_KEYS)"
b = "const CREATABLE_TYPES_FROM_LABELS = ['text', 'number', 'date', 'checkbox', 'url', 'dropdown']"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the task's field-type picker now offers six of the nineteen types.")
