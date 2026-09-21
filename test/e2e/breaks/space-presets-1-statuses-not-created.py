# The preset's task statuses are never written, so a space made from a workflow
# card comes up with none of the statuses that card promised.
#
# The insert is already wrapped in a try/catch that only logs a warning, so the
# create still answers 201 and the space looks right in every other respect —
# the preset key is stored, the views are on it, the ClickApps are on. Only the
# statuses are missing, and nothing on the way in says so.
#
# Reddens: space-presets: "the preset's task statuses were created on the space"
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
a = """      await this.db.insert(spaceStatuses).values(
        preset.statuses.map((st, i) => ({
          spaceId,
          key: st.key,
          name: st.name,
          color: st.color,
          category: st.category,
          position: i,
        })),
      ).onConflictDoNothing()
"""
b = """      void spaceStatuses
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('spaces.service.ts: a preset no longer creates its task statuses.')
