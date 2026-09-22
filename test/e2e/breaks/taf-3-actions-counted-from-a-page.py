# The per-action counts are tallied from the newest hundred rows rather than
# from the whole log — so the numbers beside each option are wrong on any busy
# task, and an action whose only occurrence is old is not offered at all.
# Reddens: task-activity-filter: "a count taken from the loaded page would read 100 or fewer"
import io
p = '/home/user/rundesk/apps/api/src/modules/activity/activity.service.ts'
a = """    const rows = await this.db
      .select({
        action: sql<string>`${taskActivity.action}::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(taskActivity)
      .where(eq(taskActivity.taskId, taskId))
      .groupBy(taskActivity.action)
      .orderBy(desc(sql`count(*)`))
    return rows.map((r) => ({ action: r.action, count: Number(r.count) }))"""
b = """    const rows = await this.db
      .select({ action: sql<string>`${taskActivity.action}::text` })
      .from(taskActivity)
      .where(eq(taskActivity.taskId, taskId))
      .orderBy(desc(taskActivity.createdAt))
      .limit(100)
    const tally = new Map<string, number>()
    for (const r of rows) tally.set(r.action, (tally.get(r.action) ?? 0) + 1)
    return [...tally.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((x, y) => y.count - x.count)"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("activity.service.ts: the action counts are tallied from the newest 100 rows instead of all of them.")
