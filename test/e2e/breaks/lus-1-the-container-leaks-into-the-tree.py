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
# IT REDDENS THREE, NOT THE ONE PREDICTED, AND ALL THREE ARE HONEST. The
# container is counted among the visible projects, it is found by identity in
# that listing, and the sidebar tree names it too — the tree reads
# `space-tree`, which has its own `isDefaultContainer = false` clause, but the
# TREE TEXT check greps for a top-level line reading "Lists", and the leaked
# project now appears in the project listing the tree also consults. Three
# surfaces, one filter, which is exactly what the comment on that filter
# claims: "all fourteen at once".
#
# The prediction was too narrow because I counted the endpoint and not its
# readers. Recorded, because a prediction that is too low is the one that hides
# reasoning nobody did.
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
