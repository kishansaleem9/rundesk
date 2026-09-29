# A STREAM THE SERVER COULD NOT FINISH IS ANSWERED WITH NOTHING: the dock reads every frame but `{ error }`, and finalizes an empty answer.
# Reddens: brain-entry-points: "and a turn the provider fails once its stream is open is answered in words — “Sorry, I encountered an error. Please try again.” — not with an empty bubble"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = '              if (parsed.error) streamFailed = true\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bep-15-a-failed-stream-answers-nothing: the error frame is not read')
