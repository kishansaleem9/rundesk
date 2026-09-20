# The action step loses its own words and falls through to the generic "Working" —
# the i18n-fallback trap, where a check for "a step is present" passes on the bug.
# Reddens: ai-answer-rendering: "with its own words, so a missing translation cannot pass as a present one"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "  create_list: 'aiPanel.stepCreatingList',\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the create_list step renders as the unknown-step fallback.')
