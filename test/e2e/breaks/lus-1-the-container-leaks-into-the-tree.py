# `GET /projects/space/:id` stops filtering out the hidden container, so it is
# listed as an ordinary project.
#
# This is the whole reason the suite says half its checks are about the
# container staying invisible: "a container that leaks is the whole reason not
# to do it this way." `lists.project_id` is still NOT NULL and 114 inner joins
# across 34 files reach a list's workspace through its project, so the
# hierarchy the person sees is carried by one hidden project per space. The
# moment that project is visible, Space → List is a lie told over Space →
# Project → List, and a project called "Lists" appears in every space anybody
# has made a space-level list in.
#
# The filter's own comment says it is the one place this is decided: it fixes
# "all fourteen at once — the tree, the Move dialog, the palette's Location
# filter, every project picker — which is the difference between one decision
# and fourteen chances to forget." Deleting the clause is taking that decision
# back and handing it to fourteen call sites, none of which make it.
#
# ONE CHECK IN THIS SUITE, and it is the check written for exactly this. The
# creation still works, the guard still resolves, tasks and search still find
# the list, and the sidebar tree — which reads a different endpoint — still
# hides it. Only the endpoint that answers "what projects are in this space"
# starts naming it.
#
# Reddens: list-under-space: "and the container it really went into is offered to nobody"
import io
p = '/home/user/rundesk/apps/api/src/modules/projects/projects.service.ts'
a = """    const base = and(
      eq(projects.spaceId, spaceId),
      eq(projects.isArchived, false),
      eq(projects.isDefaultContainer, false),
    )
"""
b = """    const base = and(
      eq(projects.spaceId, spaceId),
      eq(projects.isArchived, false),
    )
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('projects.service.ts: the space container is listed as an ordinary project.')
