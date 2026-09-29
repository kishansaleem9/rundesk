# THE SUGGESTION NAMES SOMEBODY AND NOT WHY: the reason in their numbers is dropped.
# Reddens: assign-with-ai-picker: "the picker’s ⚡ Assign with AI suggests the member with no open work, by name, with the reason in their own numbers — the suggestion route’s pick"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '          <p className="mt-0.5 text-[11px] text-muted-foreground">{answer.pick.reason}</p>\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("awa-3-no-reason: applied")
