# The task's picker offers the list route's six types instead of all nineteen —
# the exact duplicated-list drift this codebase already shipped once, where
# each picker is individually plausible and nobody compares them.
# THE COUNT IS NOT QUOTED, because the suite interpolates it: the sentence
# reads `all ${ALL_TYPES.length} field types`, so a number in this header is a
# hostage. It said 19 and the run printed 22 — three types were added after it
# was written, and the claim survived only because the matcher compares against
# the literal part of the template.
# Reddens: task-field-create: "the type picker offers all"
#   or "including the eight that only the long list has, so it is not the drifted six-item copy"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "const CREATABLE_TYPES_FROM_LABELS = Object.keys(FIELD_TYPE_LABEL_KEYS)"
b = "const CREATABLE_TYPES_FROM_LABELS = ['text', 'number', 'date', 'checkbox', 'url', 'dropdown']"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the task's field-type picker now offers six of the nineteen types.")
