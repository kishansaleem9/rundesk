# THE SERVER'S SENTENCE, FLATTENED. The named configuration problem becomes
# the house string, so an outage and a bug in the button read identically and
# nobody learns there is a key to set.
# Reddens: task-ai-bar -- 'the bar reports the SERVERS own sentence'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """      const text = err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('taskAiBar.docFailed')"""
b = """      void err
      const text = t('taskAiBar.docFailed')"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the AI bar now reports a house error, not the servers.")
