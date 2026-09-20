# A search that matches nothing takes the filter bar down with it, so the
# reader is left on an empty panel with no way to undo what emptied it.
# Reddens: task-activity-filter — "a word nothing matches empties the feed and keeps the Clear button on screen"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = """    return (
      <>
        {header}
        {filtersOn ? ("""
b = """    return (
      <>
        {null}
        {filtersOn ? ("""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-detail-sheet.tsx: the empty result no longer renders the filter bar, so the filter cannot be cleared.")
