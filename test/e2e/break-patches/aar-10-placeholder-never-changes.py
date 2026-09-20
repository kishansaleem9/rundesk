# The original defect restored: a disabled input goes on inviting you to type into it,
# whether the model is missing or an answer is already in flight.
# Reddens: ai-answer-rendering: "a composer disabled because no model is configured no longer invites you to type"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = """            placeholder={
              isStreaming
                ? t('aiPanel.placeholderWorking')
                : !aiAvailable
                  ? t('aiPanel.placeholderUnavailable')
                  : t('aiPanel.inputPlaceholder')
            }
"""
b = """            placeholder={t('aiPanel.inputPlaceholder')}
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the composer says "Ask Rundesk AI anything…" in every state again.')
