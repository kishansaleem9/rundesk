# The sidebar's way out of a non-workspace page keeps "Your workspaces" and
# drops the link back to the one you came from.
#
# THE DEAD END, half-removed. `sidebar-no-workspace` is still rendered, still
# has a way out, and `/app` genuinely reaches every workspace you belong to —
# so from the outside nothing is missing, and the `backTo` branch looks like
# duplication of a destination the picker already covers.
#
# The difference is one click versus three and, more to the point, knowing
# WHICH workspace you were in. Somebody clicks the delivery-settings gear in
# their inbox, changes a setting, and then has to pick their workspace out of a
# list to get back to the thing they were reading. The `backTo` link names it.
#
# Two checks, and the second only became a failure rather than a shorter run
# when the `if` around it got an `else`: with no back link there was nothing to
# click, so "and clicking it returns there" did not run at all, and the suite
# reported 27 of 28 checks — a headline that reads as the harness breaking.
# Third suite in this audit with that shape.
#
# Reddens: addressability-live: "naming the workspace you came from" and
#   "and clicking it returns there"
import io
p = '/home/user/rundesk/apps/web/src/components/workspace-sidebar.tsx'
a = """            {backTo ? (
              <NavLink
                to="/app/$workspaceId"
                params={{ workspaceId: backTo }}
                icon={ArrowLeft}
                label={t('nav.backToWorkspace')}
              />
            ) : null}
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-sidebar.tsx: the escape hatch no longer names where you were.')
