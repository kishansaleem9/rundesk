# The answer goes back to being a string in a `whitespace-pre-wrap` div, which is
# exactly what it was before this row: line breaks survive, every other mark does not.
# Reddens: ai-answer-rendering: "its bold runs are <strong> elements"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "      {renderMarkdownBlocks(content, renderAiInline)}\n"
b = "      <span className=\"whitespace-pre-wrap\">{content}</span>\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: an answer renders as plain text again.')
