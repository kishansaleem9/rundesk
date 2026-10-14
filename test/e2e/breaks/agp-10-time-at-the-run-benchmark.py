# AN AGENT'S TIME IS RECKONED AT THE VALUE PANEL'S MINUTES PER RUN, not its own minutes per action.
# (`found-14-oct/agent-performance-carried-and-unbuilt`) Both are 6 until one is set; then they part.
# Reddens: agent-performance: "an admin sets the minutes an action saves and the hourly rate; each agent’s row is reckoned again from them, and the value panel’s minutes per run are its own (read by SQL)"
#   or "Edit benchmark on the card saves the minutes per action and the hourly rate, and the rows are drawn again from them (read by SQL)"
import io
c = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(c, encoding='utf-8').read()
old = '      .select({ perAction: workspaces.aiMinutesSavedPerAgentAction, rate: workspaces.aiHourlyRateCents })\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '      .select({ perAction: workspaces.aiMinutesSavedPerRun, rate: workspaces.aiHourlyRateCents })\n')
io.open(c, 'w', encoding='utf-8').write(s)
print("agp-10-time-at-the-run-benchmark: an agent's time is reckoned at the value panel's minutes per run, not its own minutes per action.")
