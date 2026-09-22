# Ticking a priority off deletes it instead of marking it done.
#
# THE READING THAT IS ALMOST RIGHT. A done item is finished, and a list of
# today's priorities is a list of what is left — so removing the row when the
# box is ticked keeps the list clean and is what most checklists do. The
# endpoint keeps its name, its owner check, its 404 and its signature; only the
# statement inside changes, from an update to a delete.
#
# `[05:54]` is more specific: "I did that today" is the thing a priorities list
# is FOR. A tick that deletes leaves you at the end of the day with an empty
# list and no way to tell a day you cleared from a day you never started. The
# `doneAt` column exists precisely so the row can stay.
#
# The `done: false` path is left intact — un-ticking still works on a row that
# is still there — which is what makes the diff read as one branch being
# simplified rather than a feature being removed.
#
# TWO CHECKS, AND THE SECOND IS THE ONE THAT MATTERS: "ticking one off marks it
# done" and "and it stays on the list — I did that today survives". The suite
# wrote them as a pair for exactly this, and the second fails while the first
# fails for a different reason — there is no row to read `doneAt` off at all.
#
# Reddens: person-panel: "ticking one off marks it done" and
#   "and it stays on the list — \"I did that today\" survives"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = """  async setPriorityDone(priorityId: string, userId: string, done: boolean) {
    const [row] = await this.db
      .update(userPriorities)
      .set({ doneAt: done ? new Date() : null })
      .where(and(eq(userPriorities.id, priorityId), eq(userPriorities.userId, userId)))
      .returning()
"""
b = """  async setPriorityDone(priorityId: string, userId: string, done: boolean) {
    // A finished priority is off today's list; un-ticking still updates.
    const [row] = done
      ? await this.db
          .delete(userPriorities)
          .where(and(eq(userPriorities.id, priorityId), eq(userPriorities.userId, userId)))
          .returning()
      : await this.db
          .update(userPriorities)
          .set({ doneAt: null })
          .where(and(eq(userPriorities.id, priorityId), eq(userPriorities.userId, userId)))
          .returning()
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('people.service.ts: ticking a priority off deletes the row.')
