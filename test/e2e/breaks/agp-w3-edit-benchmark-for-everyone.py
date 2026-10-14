# EDIT BENCHMARK IS OFFERED TO EVERYONE: a member is shown the control the server refuses them.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens: agent-performance: "a member’s card draws only the agents they made, says so, and offers no Edit benchmark"
import io
c = '/home/user/rundesk/apps/web/src/components/agent-performance.tsx'
s = io.open(c, encoding='utf-8').read()
old = '          {data?.mayEditBenchmark && (\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '          {!!data && (\n')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-w3-edit-benchmark-for-everyone: edit benchmark is offered to everyone')
