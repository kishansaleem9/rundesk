# THE CONFIDENT ZERO: the grouping keys on the TASK id instead of the person's,
# so every lookup misses and every card says 0 with nothing under it. Note what
# still passes — "somebody with nothing on comes back as a real zero" — which is
# exactly why that check is asserted beside a 2 and a 3 rather than alone.
# Reddens: teams-person-cards: "the first person’s row holds the first person’s work"
#   or "and the second person’s row holds the second person’s"
#   or "the counts are each person’s own (2 and 3), not one number shared"
#   and every UI check that reads a card's work.
import io
p='/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.service.ts'
s=io.open(p,encoding='utf-8').read()
a="""      const bucket = byPerson.get(row.userId)
      if (bucket) bucket.push(row)
      else byPerson.set(row.userId, [row])
"""
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"""      const bucket = byPerson.get(row.id)
      if (bucket) bucket.push(row)
      else byPerson.set(row.id, [row])
"""))
