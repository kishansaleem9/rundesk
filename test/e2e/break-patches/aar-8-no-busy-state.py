# Back to a bare spinner: a turn spending four seconds writing into your workspace
# looks exactly like a turn that has not started.
# Reddens: ai-answer-rendering: "a busy state appears above the step log"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "        {isStreaming && <AiBusyState state={busy} t={t} />}\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the busy state is gone; only the spinner remains.')
