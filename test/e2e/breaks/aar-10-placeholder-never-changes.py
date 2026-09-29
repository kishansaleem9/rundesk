# The original defect restored: a disabled input goes on inviting you to type into it,
# whether the model is missing or an answer is already in flight.
# RE-AIMED 29 September: the resting state turns through four sentences now
# (`commit-log/log-4ad25f6-1`), so the anchor ends on that turn; the edit is the same.
# Reddens: ai-answer-rendering: "the composer says which state it is in, and it is the state /ai/status reports"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """            placeholder={
              isStreaming
                ? t('aiPanel.placeholderWorking')
                : !aiAvailable
                  ? t('aiPanel.placeholderUnavailable')
                  : t(RESTING_PLACEHOLDERS[restingTurn])
            }
"""
b = """            placeholder={t('aiPanel.inputPlaceholder')}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the composer says "Ask Rundesk AI anything…" in every state again.')
