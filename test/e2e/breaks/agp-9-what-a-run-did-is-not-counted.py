# WHAT A RUN CARRIED OUT IS NOT COUNTED: its actions stay at nothing.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens only where a model answers: without one the refused run carries out nothing either way.
# Reddens: agent-performance: "a run of the agent writes its calls as its own and counts what it carried out — and its row grows by that run, that action and those credits (read by SQL)"
import io
c = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
s = io.open(c, encoding='utf-8').read()
old = '          if (carriedOut) actionsCompleted += 1\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-9-what-a-run-did-is-not-counted: what a run carried out is not counted')
