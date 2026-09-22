# The row stops reading the connection the App Center writes and keeps its own
# answer. Two surfaces disagreeing about whether an integration somebody relies
# on is live — and the calendar page is the one that would be believed.
#
# IT RAN GREEN, AND `false === false` IS WHY. The check compares
# `rowSaysConnected` against `zoomLive`, which is the right comparison and was
# being made between two values that are both false in this deployment: there
# are no Zoom credentials here, so the App Center says not connected, and a row
# hardcoded to `false` agrees with it perfectly. The check could not have failed
# for any patch of this shape.
#
# `calendar-accounts` stages a CONNECTED zoom row in
# `workspace_integration_connections` now — inserted directly, the way it
# already stages calendar grants, and removed in the cleanup — so the App Center
# says connected and a row that has stopped reading it cannot. It is staged at
# the top of the suite rather than beside the check, so no cached `connections`
# query is holding the empty answer when the dialog reads it, and skipped if the
# workspace already has a zoom row, because overwriting somebody's real
# connection is not a thing a suite may do.
#
# PREDICTED ONE, and the check it reddens carries two other facts — the connect
# flow's 201 and its zoom.us URL — which this patch leaves alone. That is a
# looseness worth naming: a patch breaking the URL instead would redden the same
# sentence, and the failure detail is what tells the two apart.
#
# Reddens: calendar-accounts: "the row agrees with the App Center"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = "  const connected = (connections.data ?? []).some(\n    (c) => c.provider === 'zoom' && c.status === 'connected',\n  )\n"
b = '  const connected = false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('planner-settings-dialog.tsx: the Zoom row keeps its own connection state.')
