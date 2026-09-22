# The task sheet holds its own id in component state instead of in the address.
#
# The refactor that sounds right: a sheet is a component, not a page, so why is
# it in the URL? `replace: true` is already there because nobody wants Back to
# walk out through every task they glanced at — so the URL is not carrying
# history either, and taking it out looks like removing a thing that does
# nothing. The initial value still comes from `taskParam`, so a link somebody
# was SENT still opens the right task; only opening one yourself stops being
# addressable.
#
# That asymmetry is what makes it survive. Every link the app generates works.
# Every link a person tries to COPY out of their own address bar points at the
# list. "A task you open is a task you can send" is the row this suite is named
# for, and this is precisely the half of it that no unit test watches.
#
# TWO CHECKS, AND THE SECOND ONLY COUNTS SINCE THE SUITE STOPPED READING THE
# WHOLE DOCUMENT. "and that address reopens the same task" used to assert that
# `body.innerText()` contained the task's title — and the list grid behind the
# sheet renders that title in a row, so it passed with the address naming
# nothing. It reads the sheet now.
#
# Reddens: addressability-live: "opening one names it in the address" and
#   "and that address reopens the same task"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """  const { task: taskParam, view: viewParam, comment: commentParam } = Route.useSearch()
  const selectedTaskId = taskParam ?? null
  const setSelectedTaskId = (id: string | null) =>
    navigate({
      to: '/app/$workspaceId/$spaceId/$projectId/$listId',
      params: { workspaceId, spaceId, projectId, listId },
      // §V2-S06 — `comment` is dropped on every task change, closing included.
      // It describes an arrival, so keeping it would re-highlight a comment
      // every time the reader came back to that task from somewhere else.
      search: (prev: Record<string, unknown>) => ({ ...prev, task: id ?? undefined, comment: undefined }),
      replace: true,
    })
"""
b = """  const { task: taskParam, view: viewParam, comment: commentParam } = Route.useSearch()
  // The sheet is a component, not a page, and `replace: true` meant the URL was
  // not carrying history anyway. An incoming link still opens the right task.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(taskParam ?? null)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: the open task is component state, not an address.')
