# WRITING WITHOUT KEEP. A failed ask drops the instruction into the comment
# box, so the box is changed by a run that produced nothing -- the chat
# composer's first version, which rewrote your draft the moment you pressed.
# Reddens: task-ai-bar -- 'a failed ask leaves the comment box exactly as it was'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                    setAiError(
                      err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('taskDetail.aiUnavailable'),
                    )"""
b = """                    setText(aiPrompt.trim())
                    setAiError(
                      err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('taskDetail.aiUnavailable'),
                    )"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: a failed AI ask now writes the instruction into the composer.")
