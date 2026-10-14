# THE CARD'S EDIT BENCHMARK SAVES THE VALUE PANEL'S MINUTES PER RUN, not the minutes per action.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens: agent-performance: "Edit benchmark on the card saves the minutes per action and the hourly rate, and the rows are drawn again from them (read by SQL)"
import io
c = '/home/user/rundesk/apps/web/src/components/agent-performance.tsx'
s = io.open(c, encoding='utf-8').read()
for old, new in [
    ('    mutationFn: (patch: { minutesSavedPerAgentAction: number; hourlyRateCents: number }) =>\n',
     '    mutationFn: (patch: { minutesSavedPerRun: number; hourlyRateCents: number }) =>\n'),
    ('                minutesSavedPerAgentAction: Number(minutes),\n',
     '                minutesSavedPerRun: Number(minutes),\n'),
]:
    assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
    s = s.replace(old, new)
io.open(c, 'w', encoding='utf-8').write(s)
print("agp-w4-the-card-saves-the-run-minutes: the card's edit benchmark saves the value panel's minutes per run")
