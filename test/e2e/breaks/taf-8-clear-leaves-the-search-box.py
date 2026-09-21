# Clear resets the applied search but not the box it came from, so the debounce
# puts the same term straight back and the feed never recovers.
# Reddens: task-activity-filter — "Clear brings the whole feed back"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """            setSearchDraft('')
            setSearch('')
            setActionFilter('')"""
b = """            setSearch('')
            setActionFilter('')"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: Clear leaves the search box filled, so the debounce re-applies the term.")
