# The planner's Connect buttons still ask the server to start OAuth and then throw the
# answer away: `oauth/start` is called, the `authUrl` it hands back is never followed, and
# the person is left on the planner with nothing having happened. The dead control, one
# step later than usual — frames `12:40`-`12:50`.
# Reddens: planner-onboarding: "pressing Google Calendar asks the server to start OAuth for
#          \"gcal\", and sends the browser to the URL it answers with"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '    onSuccess: ({ authUrl }) => {\n      window.location.href = authUrl\n    },'
b = '    onSuccess: () => {\n      /* broken on purpose: the authUrl is dropped on the floor */\n    },'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: Connect asks for OAuth and never follows the URL it is given.')
