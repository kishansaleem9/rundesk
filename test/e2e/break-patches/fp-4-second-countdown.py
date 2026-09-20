# Each consumer of the running blocks given a query key of its own, so the
# header pill fetches them separately from the tab-title writer. Two fetches is
# two countdowns, started at different instants against different snapshots of
# the planner — the duplicated-list defect with a clock in it.
# Reddens: focus-pill:
#   "the countdown's own window was fetched once for both surfaces"
#   (both observers send the SAME url, so the count is two for one window)
import io
p = '/home/user/rundesk/apps/web/src/lib/use-focus-tab-title.ts'
pairs = [
  ("""function useFocusBlockSource(workspaceId: string | null) {
  const { t } = useTranslation()
""",
   """function useFocusBlockSource(workspaceId: string | null) {
  const instance = useRef(Math.random()).current
  const { t } = useTranslation()
"""),
  ("""    queryKey: ['focus-blocks', workspaceId, range.from],
""",
   """    queryKey: ['focus-blocks', workspaceId, range.from, instance],
"""),
]
s = io.open(p, encoding='utf-8').read()
for a, _ in pairs:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
for a, b in pairs:
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('use-focus-tab-title.ts: the pill and the tab title now hold separate query keys, so each fetches the blocks itself.')
