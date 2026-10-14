# ANY MINUTES PER ACTION ARE KEPT: past eight hours, or a fraction, until the database refuses them.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens: agent-performance: "minutes per action past eight hours, or not whole, are refused in words (400) and nothing is kept"
import io
c = '/home/user/rundesk/apps/api/src/modules/ai/ai-value.ts'
s = io.open(c, encoding='utf-8').read()
old = '  if (minutesSavedPerAgentAction !== undefined) {\n    if (!Number.isInteger(minutesSavedPerAgentAction) || minutesSavedPerAgentAction < 0 || minutesSavedPerAgentAction > MAX_MINUTES_PER_AGENT_ACTION) {\n      return `Minutes saved per agent action must be a whole number between 0 and ${MAX_MINUTES_PER_AGENT_ACTION}`\n    }\n  }\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-15-any-minutes-per-action: any minutes per action are kept')
