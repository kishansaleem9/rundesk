#!/usr/bin/env python3
"""Rehearse one job of .github/workflows/ci.yml on this machine, step by step.

  python3 rehearse.py JOB LOGDIR [--repo DIR] [--steps 1-15,140-271]
                      [--only REGEX] [--skip REGEX] [--step-timeout SEC]

Run by launch.sh inside a namespace that looks like a fresh runner; see the
README beside this file. Each `run:` step runs the way the runner runs it:
`bash -e` on a script file, the job's env and then the step's (with
${{ env.X }} filled in), from the step's working-directory, stdin closed.
Background processes a step leaves (the API, the store) live on to the end of
the job, as on the runner. `uses:` steps are set up beforehand by
checkout.sh; `playwright install` uses this machine's browsers.

EVERY STEP RUNS, EVEN AFTER A FAILURE. The workflow stops at its first one,
to save billed minutes; here the minutes are free, and the point is to find
every failure before a push. A step the runner would have skipped is marked so.

Writes LOGDIR/NNN-<step>.log per step, LOGDIR/steps.jsonl as it goes, and
LOGDIR/summary.json at the end.
"""
import argparse, json, os, re, signal, subprocess, sys, time
import yaml

# This machine against the runner, measured on 1 October from the same steps:
# one runner was 2.4 times faster than here, the next only 1.38 (its Verify ran
# out of its 25 minutes at step 72 of 76). Every limit is checked against the
# slow one.
RUNNER_FAST = 2.4
RUNNER_SLOW = 1.3

ap = argparse.ArgumentParser()
ap.add_argument('job')
ap.add_argument('logdir')
ap.add_argument('--repo', default='/home/runner/work/rundesk/rundesk')
ap.add_argument('--steps', default=None, help='step numbers to run, e.g. 1-15,140-271')
ap.add_argument('--only', default=None)
ap.add_argument('--skip', default=None)
ap.add_argument('--step-timeout', type=int, default=1800)
a = ap.parse_args()

wanted = None
if a.steps:
    wanted = set()
    for part in a.steps.split(','):
        lo, _, hi = part.partition('-')
        wanted.update(range(int(lo), int(hi or lo) + 1))

wf = yaml.safe_load(open(os.path.join(a.repo, '.github/workflows/ci.yml')))
job = wf['jobs'][a.job]


def subst(value, env):
    def rep(m):
        expr = m.group(1).strip()
        mm = re.fullmatch(r'env\.([A-Za-z_][A-Za-z0-9_]*)', expr)
        if not mm:
            raise SystemExit(f'unsupported expression in a value: {expr}')
        return env.get(mm.group(1), '')
    return re.sub(r'\$\{\{(.*?)\}\}', rep, str(value))


temp = '/home/runner/work/_temp'
os.makedirs(temp, exist_ok=True)
os.makedirs(a.logdir, exist_ok=True)

# THE NODE THE JOB SETS UP, FIRST ON PATH. /usr/local/bin holds another one
# (20, here), and a rehearsal that found it first failed a unit test the
# runner's 22 passes: Node 20's ICU prints local midnight as "24:00".
want = next((str(s['with']['node-version']) for s in job['steps']
             if 'setup-node' in str(s.get('uses', '')) and 'node-version' in (s.get('with') or {})), '22')
node_dir = f'/opt/node{want}/bin'
if not os.path.exists(os.path.join(node_dir, 'node')):
    raise SystemExit(f'the job sets up Node {want}, and there is no {node_dir}/node here')
base = {
    'PATH': os.pathsep.join([node_dir, '/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin']),
    'HOME': '/home/runner',
    'LANG': 'C.UTF-8',
    'CI': 'true',
    'GITHUB_ACTIONS': 'true',
    'RUNNER_OS': 'Linux',
    'RUNNER_TEMP': temp,
    'GITHUB_WORKSPACE': a.repo,
    # This machine's browsers, where the runner downloads its own.
    'PLAYWRIGHT_BROWSERS_PATH': os.environ.get('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers'),
}
jobenv = {}
for k, v in (job.get('env') or {}).items():
    jobenv[k] = subst(v, {**base, **jobenv})


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:60]


steps_out = open(os.path.join(a.logdir, 'steps.jsonl'), 'a')
results = []
failed = False
t_job = time.time()
for i, st in enumerate(job['steps'], 1):
    name = st.get('name') or st.get('uses') or str(st.get('run', '')).split('\n')[0][:80]
    run = str(st.get('run', ''))
    if wanted is not None and i not in wanted:
        continue
    if a.only and not re.search(a.only, name + '\n' + run):
        continue
    if a.skip and re.search(a.skip, name + '\n' + run):
        continue
    rec = {'i': i, 'name': name}
    if 'uses' in st:
        rec.update(status='set-up-beforehand', secs=0)
    elif 'playwright install' in run:
        rec.update(status='machine-browser', secs=0)
    elif run.strip() == 'pnpm install --frozen-lockfile':
        rec.update(status='installed-beforehand', secs=0)
    else:
        cond = str(st.get('if', ''))
        rec['would_skip'] = failed and 'cancelled()' not in cond and 'always()' not in cond
        env = dict(base)
        env.update(jobenv)
        for k, v in (st.get('env') or {}).items():
            env[k] = subst(v, env)
        cwd = os.path.join(a.repo, st.get('working-directory', '.'))
        script = os.path.join(temp, f'step-{i}.sh')
        with open(script, 'w') as f:
            f.write(run)
        log = os.path.join(a.logdir, f'{i:03d}-{slug(name)}.log')
        # The step's own cap is the runner's; this machine is slower, so it
        # waits three times as long before calling a step hung.
        cap = st.get('timeout-minutes')
        local_timeout = max(a.step_timeout, int(cap) * 60 * 3) if cap else a.step_timeout
        t0 = time.time()
        with open(log, 'wb') as lf:
            p = subprocess.Popen(['bash', '-e', script], cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                 stdout=lf, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                rc = p.wait(timeout=local_timeout)
                rec['status'] = 'pass' if rc == 0 else f'fail({rc})'
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(p.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                p.wait()
                rec['status'] = 'timeout'
        rec['secs'] = round(time.time() - t0, 1)
        rec['log'] = log
        if cap:
            rec['ci_cap_min'] = int(cap)
        if cap and rec['secs'] / RUNNER_SLOW > int(cap) * 60 * 0.8:
            # Within a fifth of its cap on a slow runner: it may be cut off there.
            rec['near_cap'] = True
        if rec['status'] != 'pass':
            failed = True
    rec['at_min'] = round((time.time() - t_job) / 60, 1)
    results.append(rec)
    steps_out.write(json.dumps(rec) + '\n')
    steps_out.flush()
    near = '  (near its cap on the runner)' if rec.get('near_cap') else ''
    print(f"[{i:3d}] {rec['status']:<20} {rec['secs']:>7}s  {name}{near}", flush=True)

ran = [r for r in results if r['status'] == 'pass' or r['status'].startswith('fail') or r['status'] == 'timeout']
secs = sum(r['secs'] for r in ran)
limit = job.get('timeout-minutes')
summary = {
    'job': a.job,
    'minutes': round((time.time() - t_job) / 60, 1),
    'runner_minutes_fast': round(secs / RUNNER_FAST / 60, 1),
    'runner_minutes_slow': round(secs / RUNNER_SLOW / 60, 1),
    'timeout_minutes': limit,
    'ran': len(ran),
    'passed': sum(1 for r in ran if r['status'] == 'pass'),
    'failed': [r for r in ran if r['status'] != 'pass'],
    'near_cap': [r for r in ran if r.get('near_cap')],
}
# A job a slow runner would cut off is a failure here, as it would be there.
summary['over_limit'] = bool(limit) and summary['runner_minutes_slow'] > int(limit) * 0.8
json.dump(summary, open(os.path.join(a.logdir, 'summary.json'), 'w'), indent=1)
print(f"\n{a.job}: {summary['passed']} of {summary['ran']} steps passed in {summary['minutes']} min here, "
      f"{summary['runner_minutes_fast']} to {summary['runner_minutes_slow']} on the runner (limit {limit})", flush=True)
for r in summary['failed']:
    print(f"  FAILED [{r['i']}] {r['name']} — {r['status']}, {r['secs']}s", flush=True)
for r in summary['near_cap']:
    print(f"  NEAR ITS CAP [{r['i']}] {r['name']} — {r['secs']}s here, {r.get('ci_cap_min') or '?'}-minute cap", flush=True)
if summary['over_limit']:
    print(f"  OVER THE JOB'S LIMIT: about {summary['runner_minutes_slow']} minutes on a slow runner, "
          f"within a fifth of its {limit}", flush=True)
sys.exit(1 if summary['failed'] or summary['near_cap'] or summary['over_limit'] else 0)
