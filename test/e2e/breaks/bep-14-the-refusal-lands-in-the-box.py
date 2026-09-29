# A REFUSED SUMMARY IS WRITTEN INTO THE COMMENT BOX.
#
# The panel reports the refusal correctly AND drops the same sentence into an
# empty comment box, where one press of Comment posts "AI features are not
# configured" to the task as if somebody had said it. Nothing is meant to reach
# the box but a draft somebody chose to Keep; this is the mirror defect — text
# in the record for a feature that did not run.
#
# Reddens: brain-entry-points: "and nothing reached the comment: the box is as it was and the task has no new comment — a draft goes in only by Keep"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                    setAiError(
                      err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('taskDetail.aiUnavailable'),
                    )
"""
b = """                    setAiError(
                      err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('taskDetail.aiUnavailable'),
                    )
                    setText((prev) => (prev.trim() ? prev : err instanceof Error ? err.message : prev))
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: a refused ask puts the refusal into an empty comment box.')
