# The busy state latches: the assistant goes on saying it is working after the answer
# has landed, which is the "keyed on a value that does not change" trap.
# Reddens: ai-answer-rendering: "the busy state goes away once the answer has landed"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "        {isStreaming && <AiBusyState state={busy} t={t} />}\n"
b = "        {(isStreaming || messages.length > 0) && <AiBusyState state={busy} t={t} />}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the busy state stays on screen after the answer arrives.')
