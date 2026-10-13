# A TURN THAT REACHED A CONNECTED APP IS FILED AS A TASK RUN.
# (`ledger-rows/row-2294`)
# Reddens: ai-connected-apps: "External app actions and External app searches are filled tiles, not “not available” — the runs that reached her calendar, her mailbox and her Drive are counted there (read by SQL)"
#
# External app actions and searches stay at nothing however much the AI did there.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        { recordAs: (answer) => commandUsageFeature(answer.content) },\n',
     "        { recordAs: (answer) => (answer.content.length < 0 ? commandUsageFeature(answer.content) : 'command') },\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aic-12-connected-runs-filed-as-tasks: connected-app turns are counted as task runs')
