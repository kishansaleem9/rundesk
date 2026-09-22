# The wizard sits there over a Space that now exists, inviting a second one.
#
# THREE EDITS IN TWO FILES, AND THAT IS THE FINDING RATHER THAN A LICENCE.
#
# The first version removed `onOpenChange(false)` from the template-apply
# success handler — the one line whose job is to close the dialog — and it ran
# GREEN. The wizard disappeared anyway, because `onCreated` runs immediately
# after it and the caller in `quick-create-modal.tsx` does two more things that
# each remove the dialog on their own:
#
#     onCreated={(space) => {
#       onClose()                       // closes the quick-create modal
#       navigate({ to: '/app/$workspaceId/$spaceId', ... })  // unmounts it
#     }}
#
# So "the wizard closes on success" has THREE mechanisms and the explicit close
# is the least load-bearing of them: it exists to close a tick earlier, before
# the navigation, so nobody sees the wizard flash over a page that is already
# changing. Removing it changes nothing a person can see, which is exactly why a
# single-line patch proved nothing.
#
# This removes all three, which is the minimum that can disprove the claim, and
# says so here — a patch spread across two files is not a mistake anybody would
# make, and recording it as one would be worse than the green it replaces.
# `sl-3-call-card-not-broadcast` carries the same note for the same reason.
#
# `void space` and `void navigate` keep both bindings used, because dropping
# them would fail the typecheck rather than the check.
#
# PREDICTED ONE.
#
# Reddens: space-wizard: "and the wizard closes on success rather than sitting
#   there over a Space that now exists"
import io

p = '/home/user/rundesk/apps/web/src/components/create-space-wizard.tsx'
a = '      onOpenChange(false)\n      onCreated?.(made.space)\n'
b = '      onCreated?.(made.space)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))

q = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
c = """      onCreated={(space) => {
        onClose()
        navigate({ to: '/app/$workspaceId/$spaceId', params: { workspaceId, spaceId: space.id } })
      }}
"""
d = """      onCreated={(space) => {
        void space
        void navigate
      }}
"""
t = io.open(q, encoding='utf-8').read()
assert t.count(c) == 1, f'anchor appears {t.count(c)} times in {q}, expected exactly 1'
io.open(q, 'w', encoding='utf-8').write(t.replace(c, d))
print('create-space-wizard.tsx + quick-create-modal.tsx: nothing closes the wizard on success.')
