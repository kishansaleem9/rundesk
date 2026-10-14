# THE CREDITS TAB DRAWS NO AGENT PERFORMANCE: the table exists only in Settings.
# (`found-14-oct/agent-performance-carried-and-unbuilt`) Frame `19:00` draws it under the Credits tab's trend.
# Reddens: agent-performance: "the Credits tab draws My Agent Performance under the month’s credits: a row per agent with who made it, its actions, time saved, value, cost and return"
#   or "Find agent narrows the rows to the agents whose name it holds, and says so when none has it"
#   or "Edit benchmark on the card saves the minutes per action and the hourly rate, and the rows are drawn again from them (read by SQL)"
#   or "a member’s card draws only the agents they made, says so, and offers no Edit benchmark"
import io
c = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
s = io.open(c, encoding='utf-8').read()
old = '            <AgentPerformanceCard workspaceId={workspaceId} />\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-w1-no-agent-performance-on-the-credits-tab: the credits tab draws no agent performance')
