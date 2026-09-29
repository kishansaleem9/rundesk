# THE COMMENT PANEL ANSWERS EVERY REFUSAL WITH ITS OWN "AI IS UNAVAILABLE".
#
# The server says "AI features are not configured"; the panel says something
# of its own. Two different problems — nobody configured a model, or the model
# failed — reach the reader as one sentence, and the one that is somebody's to
# fix stops saying whose. `task-ai-bar` holds the same line for the space bar's
# path through this panel, so that suite reddens beside this one.
#
# Reddens: brain-entry-points: "and the panel shows what the server answered, as /ai/status says it will — with no model, its own words: “AI features are not configured”"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                    setAiError(
                      err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('taskDetail.aiUnavailable'),
                    )
"""
b = """                    setAiError(t('taskDetail.aiUnavailable'))
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the comment AI panel replaces the server\'s reason with a house line.')
