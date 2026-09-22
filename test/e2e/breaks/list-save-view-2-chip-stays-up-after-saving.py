# `updateSavedView` stops bumping `viewStamp`, so the saved fingerprint is
# never refreshed and the chip stays lit after a successful save.
#
# This is a regression this code has already had, and the comment on
# `savedFingerprint` records it in full: the value was held in a ref, updating
# a ref re-renders nothing, and "the screen kept the value from before the
# save. `list-save-view.mjs` failed on exactly that, which is why its last
# check exists."
#
# The state version cannot fail that way, so this patch removes the other half
# — the bump that tells the effect to re-fingerprint. Same symptom, different
# mechanism, and a one-line deletion that looks like tidying: `setViewStamp` is
# called in four places and its argument is `(n) => n + 1`, which reads as a
# counter nobody is counting.
#
# EXACTLY THE LAST CHECK. The PATCH still goes out with the right body, so the
# three checks about saving stay green — the failure is about what the chip
# says afterwards, which is the only thing that changed.
#
# Reddens: list-save-view: "and the chip goes once there is nothing left to save"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """    await api(`/views/${viewId}`, { method: 'PATCH', body: { config: currentViewConfig() } })
    await refreshSavedViews()
    setViewStamp((n) => n + 1)
"""
b = """    await api(`/views/${viewId}`, { method: 'PATCH', body: { config: currentViewConfig() } })
    await refreshSavedViews()
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: saving no longer re-fingerprints, so the chip stays up afterwards.')
