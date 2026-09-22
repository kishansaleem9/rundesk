# The second-level panel preference is written to localStorage and never to the
# server.
#
# ITS MIRROR, EXACTLY: the value is stored, correctly, and no reader anywhere
# else can reach it. `persistPanelsRemote` stays registered, stays typed, stays
# called from nowhere — the kind of line that goes when somebody notices two
# writes for one preference and removes the redundant-looking one. Zustand's
# `persist` middleware is right there in the same file doing the same job, and
# the outer sidebar's `collapsed` keeps both writes, so the file does not even
# look inconsistent afterwards.
#
# Every check on the machine that made the choice still passes. The panel
# collapses, stays collapsed across a reload, survives a navigation, and
# `localStorage` holds the truth. It is a preference that is forgotten the
# moment you sit at a different desk — and the suite's own header says that is
# the check that matters most: "a preference stored only in localStorage is a
# preference that is forgotten on the next machine".
#
# Two checks and both read the SERVER rather than the screen: the /users/me
# assertion that collapsing the docs tree said nothing about the chat list, and
# the second browser context signed in fresh that has to open with the panel
# already collapsed. Nothing observable in the first context changes at all.
#
# Reddens: panel-collapse: "collapsing the docs tree said nothing about the chat list"
import io
p = '/home/user/rundesk/apps/web/src/store/sidebar.ts'
a = """      togglePanel: (panel) => {
        const next = { ...get().panels, [panel]: !get().panels[panel] }
        set({ panels: next })
        persistPanelsRemote?.(next)
      },
"""
b = """      togglePanel: (panel) => {
        // `persist` below already writes this; one store, one write.
        const next = { ...get().panels, [panel]: !get().panels[panel] }
        set({ panels: next })
      },
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sidebar.ts: the panel preference never reaches the server.')
