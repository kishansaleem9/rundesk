# TWO LISTINGS AT ONCE MAKE TWO #general: #general is made with no lock held, so each listing that
# reads before the other writes makes its own, as before `found-7-oct/two-first-listings-make-two-generals`.
#
# Reddens: made-once: "a new workspace whose channels are listed four times at once has one #general, each of three (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = """      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`chat-general:${workspaceId}`}))`)
      const [found] = await tx
"""
b = """      const [found] = await tx
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mo-1-two-listings-make-two-generals: #general is made with no lock held')
