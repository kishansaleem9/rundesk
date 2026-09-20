# The free-text match moves out of SQL and runs on the rows the LIMIT already
# cut down to — the server-side version of the same confident zero.
# Reddens: task-activity-filter — "searching for it finds exactly the one entry"
import io
p = '/home/user/rundesk/apps/src/nonexistent'
p = '/home/user/rundesk/apps/api/src/modules/activity/activity.service.ts'
a = """      if (textMatch) conds.push(textMatch)"""
b = """      void textMatch"""
c = """    return rows.map((r) => ({
      id: r.id,"""
d = """    const qLower = q.toLowerCase()
    const kept = rows.filter((r) =>
      `${r.action} ${JSON.stringify(r.meta ?? {})} ${r.actorName ?? ''} ${r.actorEmail ?? ''}`
        .toLowerCase()
        .includes(qLower),
    )
    return kept.map((r) => ({
      id: r.id,"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor A appears {s.count(a)} times, expected exactly 1'
assert s.count(c) == 1, f'anchor B appears {s.count(c)} times, expected exactly 1'
s = s.replace(a, b).replace(c, d)
# `q` is block-scoped in the original; hoist it so the post-limit filter can see it.
e = "    const q = (opts.q ?? '').trim()"
assert s.count(e) == 1, f'anchor C appears {s.count(e)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s)
print("activity.service.ts: the free-text search now runs on the rows the LIMIT already returned.")
