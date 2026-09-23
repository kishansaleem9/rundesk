# A CHOSEN TASK IS NAMED FROM THE SEARCH RESULTS, as it was — outside them it is "unknown".
# Reddens: task-pickers-search: "a Tasks field finds it by search, relates it, and draws it by title"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '  const titleOf = (id: string) => chosen[value.indexOf(id)]?.data?.title\n'
b = '  const titleOf = (id: string) => (results.data ?? []).find((c) => c.id === id)?.title\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tps-11-field-titles-from-results: applied")
