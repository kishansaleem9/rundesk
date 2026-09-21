# Your own question is run through the markdown parser, so an asterisk you typed is
# silently eaten out of it — a question about globbing comes back reformatted.
# Reddens: ai-answer-rendering: "while the QUESTION keeps its asterisks exactly as they were typed"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "          {isUser ? message.content : <AiAnswer content={message.content} testId={`ai-answer-${message.id}`} />}\n"
b = "          <AiAnswer content={message.content} testId={`ai-answer-${message.id}`} />\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: questions are markdown-parsed as well as answers.')
