# THE RETURN IS DRAWN AS A PERCENT: 25× reads as 2500%, a figure nobody can read as a multiple.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens: agent-performance: "the Credits tab draws My Agent Performance under the month’s credits: a row per agent with who made it, its actions, time saved, value, cost and return"
import io
c = '/home/user/rundesk/apps/web/src/components/agent-performance.tsx'
s = io.open(c, encoding='utf-8').read()
old = "                    {a.roi === null ? '—' : `${a.roi}×`}\n"
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, "                    {a.roi === null ? '—' : `${a.roi * 100}%`}\n")
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-w5-the-return-as-a-percent: the return is drawn as a percent')
