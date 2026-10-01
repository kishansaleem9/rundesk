# The blocks are keyed on the first day drawn alone, as they were until
# 1 October.
#
# Two spans that start on the same day then share one cached answer. Day
# fetches its one day; 4 days starts there too, so it is handed Day's answer
# and never asks for the three days after it, which read empty. On the 1st of a
# month Month starts there as well and draws the whole month from that day:
# rehearsing CI on 1 October, planner-views' late-month block was not drawn.
#
# The late-month check reddens only on the 1st, which is why it never had on
# the lanes. The check written for this one reddens on any day.
#
# Reddens: planner-views: "and a block two days on is fetched and drawn in it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = """    queryKey: ['planner-blocks', workspaceId, rangeFrom.toISOString(), rangeTo.toISOString()],
"""
b = """    queryKey: ['planner-blocks', workspaceId, rangeFrom.toISOString()],
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the blocks are keyed on their first day alone.')
