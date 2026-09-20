# Only the inline marks are parsed, so bold still works and headings, lists and
# tables do not — the half-fix that passes a "markdown renders" check.
# Reddens: ai-answer-rendering: "and its heading and three-item list are real block elements"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "      {renderMarkdownBlocks(content, renderAiInline)}\n"
b = "      {renderAiInline(content, 'flat')}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: answers parse inline marks only; block structure is dropped.')
