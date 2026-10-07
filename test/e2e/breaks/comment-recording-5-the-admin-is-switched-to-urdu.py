# THE RUN SWITCHES THE SHARED ADMIN TO URDU AGAIN, as it did until `commit-log/log-944e47f-1`: every later suite
# reads the admin in Urdu, and nothing puts the language back. (The run's own recorder is left as it was.)
# NOTE: run on a lane, this leaves that lane's admin in Urdu; put it back after (`update users set locale = 'en'`).
# Reddens: comment-recording: "and the shared admin's language is the one this run found: the recording is made by an account of the run's own"
import io
p = '/home/user/rundesk/test/e2e/comment-recording.mjs'
a = "  const toUrdu = await asRecorder('/users/me', { method: 'PATCH', body: { locale: 'ur' } })\n"
b = "  const toUrdu = await A('/users/me', { method: 'PATCH', body: { locale: 'ur' } })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('comment-recording-5-the-admin-is-switched-to-urdu: the run sets the shared admin\'s language, not its own recorder\'s.')
