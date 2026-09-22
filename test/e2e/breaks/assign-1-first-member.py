# THE ONE THIS ROW EXISTS FOR: the assignee "choice" returns the first candidate the
# query happened to return. It names somebody every time, the reason sentence is still
# built from that person's real numbers so it reads perfectly, and it assigns the same
# person to everything for ever. It photographs identically to a working ranking.
# RE-AIMED. This claimed "the candidate's in-this-list count is the one task this
# run put there" and its run reddened something else entirely: the only failure is
# "and names SOMEBODY ELSE once the first person is carrying the load", which is
# exactly what a `members[0]` implementation breaks. The `inList` count a
# first-member picker reports is still correct, so the claimed check passes under
# this patch — the misattribution the reddened checker calls UNPROVEN.
# Reddens: ai-assign: "and names SOMEBODY ELSE once the first person is carrying the load"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-assign.ts'
a = """  const ranked = [...candidates]
    .sort((a, b) => {"""
b = """  const ranked = [...candidates]
    .sort(() => 0)
    .sort((a, b) => {
      if (true) return 0"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-assign.ts: rankAssignees now keeps the arrival order, so the pick is candidates[0].')
