# Check 9 — drop the extra priority words, so Jira's 'Highest' falls through to a
# substring match and lands on `high` instead of `urgent`.
#
# Reddens: imports: "the fields the CSV carried are the fields the task has"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (URGENT_WORDS.some((w) => v.includes(w))) return 'urgent'"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "  if (URGENT_WORDS.slice(0, 0).some((w) => v.includes(w))) return 'urgent'"))
print("BROKE check 9: 'Highest' now imports as high rather than urgent")
