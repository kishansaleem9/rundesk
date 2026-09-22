# HALF A HINT AGAIN. The composer hint goes back to the slash half only, on
# the strength of a reason -- there is no space-for-AI hook -- that stopped
# being true the day /ai/writing/improve shipped.
# Reddens: task-ai-bar -- "both halves, because both halves now do something"
#   — the sentence interpolates the hint it read, so an ellipsis stands
#   for the part that is not in the file; the claim quotes the part that is
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
a = """  'taskDetail.composerHint': "Press 'space' for AI, '/' for commands","""
b = """  'taskDetail.composerHint': "Press '/' for commands","""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("catalogs.ts: the composer hint is back to the slash half only.")
