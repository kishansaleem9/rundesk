# `useLiveCall` stops requiring a channel and asks the API about `null`.
#
# `enabled: !!workspaceId && !!channelId` is what stops the query firing before
# a channel is chosen. Without the second clause the request goes out as
# `…/live?channelId=null` — the literal string, because that is what template
# interpolation does to null — and `malformed-ids` exists because of this exact
# request: "a client that interpolated a missing id into its query string
# reached `where channel_id = 'null'`."
#
# The API refuses it properly now, so nothing breaks and nothing is logged as
# an error. The cost is a request per mount per twenty seconds asking a
# question that cannot be answered, and a 400 in every network panel anybody
# opens while debugging something else.
#
# THE CHECK IT REDDENS IS ASKED OF THE WHOLE SESSION, not of one moment, and
# the suite explains why: "the bad request fires on a call.* event, so it lands
# at start, at join and at leave, and sampling anywhere would miss two of the
# three." It also asserts the SHAPE rather than the string — "a channel id this
# suite never created is still a bug worth failing on, and 'null' is only the
# spelling it happened to have" — so this patch is caught by what it is rather
# than by the word it produces.
#
# ONE CHECK. The call starts, survives the navigation and hangs up correctly;
# the only thing wrong is a question asked of the server that the server was
# right to refuse.
#
# Reddens: call-survives-navigation: "and never asked the API about a channel that is not one"
import io
p = '/home/user/rundesk/apps/web/src/lib/calls-api.ts'
a = "    enabled: !!workspaceId && !!channelId,\n    refetchInterval: 20_000,"
b = "    enabled: !!workspaceId,\n    refetchInterval: 20_000,"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('calls-api.ts: the live-call query now fires with no channel, asking about "null".')
