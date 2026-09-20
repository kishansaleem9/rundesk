# THE RIGHT CONTROL IN THE WRONG PLACE.
#
# Frame `09:35` reads `Today` · `Month ▾` · `‹` `›` · `August 2026`, and Today
# is leftmost. Swapped behind Prev it still works, which is why only measured
# geometry catches it — and why "it looks right" is not a check.
#
# Reddens list-view-controls: "Today is on the toolbar, and leftmost as the
# frame draws it".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
head = '                <Button\n                  size="sm"\n                  variant="outline"\n                  data-testid="list-calendar-today"'
tail = '                  data-testid="list-calendar-prev"\n'
assert s.count(head) == 1, f'Today anchor appears {s.count(head)} times, expected exactly 1'
assert s.count(tail) == 1, f'Prev anchor appears {s.count(tail)} times, expected exactly 1'
start = s.index(head)
prev_start = s.index('                <Button\n                  size="sm"\n                  variant="outline"\n                  data-testid="list-calendar-prev"')
end_marker = '                </Button>\n              </div>\n              <div className="flex items-center gap-3">'
assert s.count(end_marker) == 1, 'toolbar tail anchor is not unique'
end = s.index(end_marker) + len('                </Button>\n')
today_block = s[start:prev_start]
prev_block = s[prev_start:end]
io.open(p, 'w', encoding='utf-8').write(s[:start] + prev_block + today_block + s[end:])
print('$listId.tsx: Today now sits to the RIGHT of Prev on the calendar toolbar.')
