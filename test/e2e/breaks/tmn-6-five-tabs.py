# A SECTION THE FRAME DRAWS, DROPPED. Channels comes out of the tab strip,
# which is how three of these six went missing in the first place: each
# remaining tab is individually plausible.
# Reddens: task-mentions -- 'the picker draws all six of the frames tabs, in the frames order'
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """                ['channels', 'taskDetail.mentionChannels'],"""
b = """"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the @ picker no longer offers Channels.")
