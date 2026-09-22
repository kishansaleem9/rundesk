# `getListsBySpace` returns the lists of EVERY project in the space, not just
# the hidden container's.
#
# "Everything in the space's hidden container, which is exactly the set that was
# created by choosing a Space and nothing else" becomes everything in the
# space. The endpoint that answers "which lists belong to this space directly"
# starts answering "which lists are anywhere under this space", and the two
# levels the walkthrough narrates — *"pehle space hoti hai. Iske baad LIST aati
# hai"* — collapse into one flat bag.
#
# It reads as a fix rather than a break, which is what makes it worth a patch:
# somebody asks why a list they made inside a project is missing from the space
# listing, and this is the change that makes it appear.
#
# WHAT IT COSTS is that the distinction stops existing. A space-level list and
# a project-level list are the same thing to this endpoint, so nothing can tell
# a person which of the two they made — and the container's whole job is to
# keep that difference without a schema change.
#
# The fixture makes a project with its own list, so the count is the assertion:
# the space listing must hold the space-level list and not the project's.
#
# Reddens: list-under-space: "and the space can be asked for the lists that belong to it"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = """    if (!container) return []
    return this.getListsByProject(container.id, actor)
"""
b = """    if (!container) return []
    const all = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.spaceId, spaceId))
    const out = []
    for (const p of all) out.push(...(await this.getListsByProject(p.id, actor)))
    return out
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lists.service.ts: the space listing now returns every list under the space.')
