# `deploy-prod.sh` stops going through `publish_web_dist` and swaps the staging
# directory in itself.
#
# TWO SCRIPTS PUBLISH THE SPA, and that is the whole reason this check exists in
# duplicate. `deploy.sh` is what the GitHub Actions deploy runs and what
# `deploy/README` tells people to run; `deploy-prod.sh` is the other one. A fix
# that lands in only one never reaches production, and a change that leaves one
# behind is invisible from the other — which is the duplicated list, spelled as
# two shell scripts.
#
# The replacement is what somebody would write if they did not know what the
# library does: move the staging dir into place, atomically, with a symlink
# swap. It is correct about deploying and silent about the thing the library is
# FOR — carrying the previous release's chunks forward, so a tab open across the
# deploy can still import what its shell names. Nothing about the deploy fails.
# The next person to click search in an already-open tab is the one who finds
# out.
#
# Predicted one: the loop checks each script separately, and `deploy.sh` is
# untouched, so exactly one of the two iterations fails. A patch that broke the
# shared library instead would fail neither — which is why this check is about
# the call site and `test/deploy/publish-web-dist.test.sh` covers the library.
#
# The check is a template literal — `${script} publishes through
# publish_web_dist` — so the claim quotes the part that is really in the file
# and names the iteration outside the quotes. Writing out the rendered sentence
# instead is a claim no suite contains, and `check-break-claims.mjs` says so.
#
# Reddens: stale-chunk-recovery: "${script} publishes through publish_web_dist"
#   (its deploy/deploy-prod.sh iteration; the deploy/deploy.sh one stays green)
import io
p = '/home/user/rundesk/deploy/deploy-prod.sh'
a = """# shellcheck source=lib/publish-web-dist.sh
source deploy/lib/publish-web-dist.sh
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'source anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)

call = "publish_web_dist\n"
assert s.count(call) == 1, f'call anchor appears {s.count(call)} times in {p}, expected exactly 1'
s = s.replace(
    call,
    'rm -rf apps/web/dist.old && mv apps/web/dist apps/web/dist.old 2>/dev/null || true\n'
    'mv apps/web/dist.staging apps/web/dist\n',
)
io.open(p, 'w', encoding='utf-8').write(s)
print('deploy-prod.sh: publishes the staging dir itself, carrying nothing forward.')
