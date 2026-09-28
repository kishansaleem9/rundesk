# THE DEFECT THIS ROW FOUND, PUT BACK. The whole picker is gated on the
# PEOPLE list having a match, whatever tab is up -- so narrowing a Whiteboards
# search to a word no colleague is called makes the picker vanish mid-search
# and takes the tab strip with it.
# Reddens: task-mentions: "and the picker stays up on Whiteboards (1 row) while the People list has 0 matches for the same word"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """        {showMentions && ("""
b = """        {showMentions && mentionCandidates.length > 0 && ("""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the @ picker is gated on the People list again.")
