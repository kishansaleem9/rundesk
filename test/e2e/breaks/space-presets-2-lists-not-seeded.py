# The preset's first lists are never created, so a space made from a workflow
# card comes up empty.
#
# This is the one the suite calls "the one that makes the purpose question
# worth asking": everything else — the preset key, the views, the ClickApps,
# the statuses — can pass on a build that stores the answer and does nothing
# with it. An empty space is what that build looks like from the inside.
#
# Reddens: space-presets: "and the space is not empty — the preset seeded its first lists"
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
a = """      const containerId = await this.lists.defaultContainerForSpace(spaceId, actorId)
      for (const name of preset.seedLists) {
        await this.lists.createList(containerId, { name }, actorId)
      }
"""
b = """      await this.lists.defaultContainerForSpace(spaceId, actorId)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('spaces.service.ts: a preset no longer seeds its first lists.')
