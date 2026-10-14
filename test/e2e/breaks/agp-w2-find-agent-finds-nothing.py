# FIND AGENT FINDS NOTHING: what is typed is kept, and every row stays drawn.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens: agent-performance: "Find agent narrows the rows to the agents whose name it holds, and says so when none has it"
import io
c = '/home/user/rundesk/apps/web/src/components/agent-performance.tsx'
s = io.open(c, encoding='utf-8').read()
old = '    return words ? rows.filter((a) => a.name.toLowerCase().includes(words)) : rows\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '    return words ? rows : rows\n')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-w2-find-agent-finds-nothing: find agent finds nothing')
