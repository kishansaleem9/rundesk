# Saving sends only the setting that was changed, instead of the whole layout.
#
# A delta, which sounds like an improvement and is a way to lose everything
# else. The server stores `config` as one document: a PATCH carrying
# `{ groupBy }` alone replaces the saved config with a config that has a
# grouping and no filters, no sort, no hidden fields and no card size. The view
# comes back next week meaning something different from what was saved, which
# is the failure this item exists to prevent — stated in the frame as "the
# filters, the sort, the grouping and the columns" going missing together.
#
# The check it reddens is the one that looks redundant beside the check above
# it. "and sends the change that raised it" passes under this patch, because
# the change that raised it is the one thing a delta does carry. Only "along
# with the rest of the layout, not just the field that changed" fails — a check
# whose whole content is the phrase "not just".
#
# RE-AIMED 6 October: the autosave sends the config too (`found-6-oct/autosave-switch-saves-nothing`); this is Save view’s.
# Reddens: list-save-view: "along with the rest of the layout, not just the field that changed"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = "  const updateSavedView = (viewId: string) =>\n    sayingViewRefusal(async () => {\n      await api(`/views/${viewId}`, { method: 'PATCH', body: { config: currentViewConfig() } })"
b = "  const updateSavedView = (viewId: string) =>\n    sayingViewRefusal(async () => {\n      await api(`/views/${viewId}`, { method: 'PATCH', body: { config: { groupBy: currentViewConfig().groupBy } } })"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: saving a view now sends only the grouping.')
