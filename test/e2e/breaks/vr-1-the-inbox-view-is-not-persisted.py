# The inbox view controls stop writing to the server, so a choice lasts until
# the page reloads.
#
# `setInboxView` keeps its invalidation and loses its request. The drawer's
# checkboxes still tick, the rows still re-sort — because the local
# `inboxView` object is rebuilt from the query and the optimistic path still
# re-renders — and the preference is gone next time.
#
# This is the defect class the suite says it is about, in its own words two
# lines above the check: "A checkbox that only changes its own tick is the
# whole defect class this audit is about." The distinction here is one step
# finer: the tick AND the sort both change, and only the server does not.
#
# WHY THE SUITE CHECKS THE SERVER DIRECTLY. The row order changing proves the
# component reacted; `GET /notifications/preferences` is the only thing that
# proves the choice outlived the session. That is the check this reddens, and
# the two around it — the sort really re-ordering, the date headers really
# going — stay green, which is what separates "the control works" from "the
# control is remembered".
#
# Reddens: video-regression: "and the server remembers the choice"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-inbox-page.tsx'
a = """    mutationFn: (patch: Partial<InboxViewPrefs>) =>
      api('/notifications/preferences', { method: 'POST', body: { inboxView: { ...inboxView, ...patch } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-preferences'] }),
  })

  const setPrimaryTypes = useMutation({
"""
b = """    mutationFn: async (patch: Partial<InboxViewPrefs>) => {
      void patch
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-preferences'] }),
  })

  const setPrimaryTypes = useMutation({
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-inbox-page.tsx: the inbox view controls no longer reach the server.')
