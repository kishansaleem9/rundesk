# "NO MATCHING TASKS" WHILE THE SEARCH IS STILL IN FLIGHT.
# Reddens: task-pickers-search: "typing @@ and its word in a comment shows the search in flight, not \"no matching tasks\" — and then offers the oldest task"no matching tasks"typing @@ and its word in a comment shows the search in flight, not \"no matching tasks\" — and then offers the oldest task"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '                {mentionTasksQuery.isPending ? (\n'
b = '                {mentionTasksQuery.isPending && taskMentionCandidates.length > 0 ? (\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tps-6-mention-none-while-searching: applied")
