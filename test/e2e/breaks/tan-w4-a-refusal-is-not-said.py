# A REFUSAL IS NOT SAID: Analytics says it could not load.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "the admin’s audience is saved from the page and a member opening Analytics then reads why not; turned off from the page, it says it is off and offers the admin Turn on again (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/teams-analytics.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        {query.error instanceof ApiError ? query.error.message : t('teams.analytics.loadFailed')}\n",
     "        {t('teams.analytics.loadFailed') /* BROKEN: the refusal is not said */}\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-w4-a-refusal-is-not-said: a refusal is not said')
