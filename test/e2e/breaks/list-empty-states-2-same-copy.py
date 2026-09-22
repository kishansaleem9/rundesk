# THE TWO EMPTY STATES, SAYING THE SAME THING.
#
# The narrow version of the bug, and the one a "an empty state renders" check
# cannot see: the filtered element still exists, still carries its testid,
# still reports its narrowings in `data-filters` — and reads word for word
# like the empty-list box, Create task button and all.
#
# Reddens list-empty-states: "the filtered state says something DIFFERENT from
# the empty-list state", "it does not invite you to create a task that the
# filter would immediately hide", "the search term itself is on screen",
# "and says so in words".
#
# Reddens: list-empty-states: "the filtered state says something DIFFERENT from the empty-list state"
import io, re
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()

start = s.index('            <Filter className="mx-auto mb-3 h-6 w-6')
end_anchor = "            </Button>\n          </div>\n        ) : visibleTasks.length === 0 ? ("
assert s.count(end_anchor) == 1, f'tail anchor appears {s.count(end_anchor)} times, expected exactly 1'
end = s.index(end_anchor)
assert s.count('            <Filter className="mx-auto mb-3 h-6 w-6') == 1, 'head anchor is not unique'

same = (
    "            <p className=\"text-[15px] font-medium text-foreground mb-1\">{t('list.noTasksYet')}</p>\n"
    "            <p className=\"text-[13px] text-muted-foreground mb-4\">\n"
    "              {t('list.empty.addFirstHintBefore')}{' '}\n"
    "              <kbd className=\"px-1.5 py-0.5 rounded bg-muted text-[11px] font-mono\">C</kbd> {t('list.empty.addFirstHintAfter')}\n"
    "            </p>\n"
    "            <Button size=\"sm\" className=\"bg-violet-600 hover:bg-violet-700 text-white\" onClick={() => quickAddRef.current?.focus()}>\n"
    "              {t('list.createTask')}\n"
)
io.open(p, 'w', encoding='utf-8').write(s[:start] + same + s[end:])
print('$listId.tsx: the filtered empty state now renders the empty-list copy verbatim — same words, same button.')
