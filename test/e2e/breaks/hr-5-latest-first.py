# LATEST FIRST: the reminder about to go off sinks below the one in two days.
# Reddens: home-reminders: "soonest first — the one due in an hour above the one due in two days"
import io
p = '/home/user/rundesk/apps/api/src/modules/reminders/task-reminders.service.ts'
a = "      .orderBy(asc(reminders.remindAt))\n  }\n\n  /** The caller's reminders about one chat message"
b = "      .orderBy(desc(reminders.remindAt))\n  }\n\n  /** The caller's reminders about one chat message"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/reminders/task-reminders.service.ts'
a = "import { and, asc, eq, isNull, lte } from 'drizzle-orm'\n"
b = "import { and, asc, desc, eq, isNull, lte } from 'drizzle-orm'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hr-5-latest-first: applied")
