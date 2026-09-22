# High contrast is remembered by the browser and not by the account.
#
# ITS MIRROR, with the twist that makes this one worth having: the value IS
# stored, in `localStorage`, by the `persist` middleware three lines below — and
# `hydrateHighContrast` is still there reading the server's copy on load. So the
# toggle survives a reload, survives a navigation, and the file reads as a
# store that persists properly, because it does. Only the write-back goes.
#
# The plausible reasoning is the one `hydrateTheme`'s own comment makes about
# the other half of this store: "Applied from GET /users/me on load; must not
# re-PATCH the server." Somebody reading that and then seeing `setHighContrast`
# call both `set` and a PATCH can talk themselves into the PATCH being the
# duplicate.
#
# It is the one preference where the machine is the wrong place to keep it. A
# person who needs high contrast needs it on every device they sign into, and
# this is the setting that silently does not travel — no error, and the only
# symptom is the app looking normal on a machine they have not used before.
#
# One check, and it is the only one in the section that asks the SERVER. The
# class is applied, the colour changes, the token lands near black — everything
# about this browser is correct.
#
# Reddens: settings-depth: "and the choice follows the person to their next device"
import io
p = '/home/user/rundesk/apps/web/src/store/theme.ts'
a = """      setHighContrast: (on) => {
        applyHighContrast(on)
        set({ highContrast: on })
        persistHighContrast(on)
      },
"""
b = """      setHighContrast: (on) => {
        // `persist` below already stores this; one store, one write.
        applyHighContrast(on)
        set({ highContrast: on })
      },
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('theme.ts: high contrast never reaches the account.')
