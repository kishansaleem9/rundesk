# THE COMMENT PANEL ANSWERS EVERY REFUSAL WITH ITS OWN "AI IS UNAVAILABLE".
# Reddens only where no model answers: with one, the summary is drafted and nothing is refused.
#
# The server says "AI features are not configured"; the panel says something
# of its own. Two different problems — nobody configured a model, or the model
# failed — reach the reader as one sentence, and the one that is somebody's to
# fix stops saying whose. `task-ai-bar` holds the same line for the space bar's
# path through this panel, so that suite reddens beside this one.
#
# Re-aimed 9 October: the Run button sits under `aiMode !== 'image'` now, two spaces deeper, beside the panel's Generate image (`ledger-rows/row-870`).
# Reddens: brain-entry-points: "and the panel shows what the server answered, as /ai/status says it will — with no model, its own words: “AI features are not configured”"
#   or "Draft a reply sends the task and what was asked to /ai/comment-reply, and the panel shows what the server answered, as /ai/status says it will"
#
# Re-aimed 9 October: the last 1 of these are knock-ons of the same edit, measured on lane 2 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                      setAiError(
                        err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('taskDetail.aiUnavailable'),
                      )
"""
b = """                      setAiError(t('taskDetail.aiUnavailable'))
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the comment AI panel replaces the server\'s reason with a house line.')
