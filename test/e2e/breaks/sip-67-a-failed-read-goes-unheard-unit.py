# A SWEEP'S FAILED SESSION READ GOES UNHEARD AGAIN (`found-30-sep/an-open-socket-outlives-its-session`).
#
# The sweep settles its session reads together, so a read that fails answers
# nothing and its socket is asked about at the next sweep. Await them one by one
# again, as the first version did, and a read that fails while an earlier one is
# awaited has nobody listening: in the timer that rejection ends the process
# (measured on a lane: the database refused connections for eight seconds while
# a socket was open, and the API exited and stayed down), and the sweep itself
# throws when the loop reaches it.
#
# Reddens: unit: realtime.gateway.test.ts "a sweep whose session reads fail resolves, ends no socket, and leaves no rejection unheard"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "    const answers = await Promise.allSettled(sids.map((sid) => sessionIsLive(this.db, { sub: users.get(sid), sid })))\n"
b = (
    "    const reads = sids.map((sid) => sessionIsLive(this.db, { sub: users.get(sid), sid }))\n"
    "    const answers: PromiseSettledResult<boolean>[] = []\n"
    "    for (const read of reads) answers.push({ status: 'fulfilled', value: await read })\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-67-a-failed-read-goes-unheard-unit: the sweep awaits its session reads one by one, a failed one unheard')
