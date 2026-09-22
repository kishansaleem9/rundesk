# `GET /calls/live` goes back to guarding with `if (!channelId)` alone.
#
# That is the guard the route shipped with, and the string "null" is truthy, so
# a client that interpolated a missing id into its query string walked past it
# and had `where channel_id = 'null'` refused by Postgres. The caller answers
# 400 either way; what changes is that the 400 is the database's generic "A
# value has an invalid format" rather than this route saying what was wrong.
#
# SCOPED TO THE QUERY PARAM ON PURPOSE. The path-param half lives in the guard
# and has its own patch — a single patch that removed both would redden four
# checks at once and prove only that something, somewhere, stopped validating.
# The two checks this one moves are the two that name a query param.
#
# The check below it — "and no channel at all is still simply no call" — must
# stay green, because `!channelId` is exactly the line that still handles the
# absent case. A patch that reddened both would be modelling "the route broke",
# not "the route stopped telling malformed apart from absent".
#
# Reddens: malformed-ids: "the live-call lookup rejects \"null\" rather than asking about it"
import io
p = '/home/user/rundesk/apps/api/src/modules/calls/calls.controller.ts'
a = """    if (!isUuid(channelId)) throw new BadRequestException('Malformed channelId')
    return this.svc.liveInChannel(channelId, user.id)
"""
b = """    return this.svc.liveInChannel(channelId, user.id)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('calls.controller.ts: channelId="null" now reaches the database instead of being rejected.')
