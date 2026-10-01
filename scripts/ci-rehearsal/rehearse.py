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

# This machine against the runner, measured on 1 October from the same steps
# (Verify's lint, typecheck and gates): the runner is about 2.4 times faster.
RUNNER_SPEEDUP = 2.4

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
base = {
    'PATH': os.pathsep.join([os.path.dirname(sys.executable), '/opt/node22/bin', '/usr/local/sbin',
                             '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin']),
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
        if cap and rec['secs'] / RUNNER_SPEEDUP > int(cap) * 60 / 2:
            # Over half its cap on the runner, estimated: too close to call safe.
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
summary = {
    'job': a.job,
    'minutes': round((time.time() - t_job) / 60, 1),
    'runner_minutes_estimated': round(sum(r['secs'] for r in ran) / RUNNER_SPEEDUP / 60, 1),
    'timeout_minutes': job.get('timeout-minutes'),
    'ran': len(ran),
    'passed': sum(1 for r in ran if r['status'] == 'pass'),
    'failed': [r for r in ran if r['status'] != 'pass'],
}
json.dump(summary, open(os.path.join(a.logdir, 'summary.json'), 'w'), indent=1)
print(f"\n{a.job}: {summary['passed']} of {summary['ran']} steps passed in {summary['minutes']} min here, "
      f"about {summary['runner_minutes_estimated']} on the runner (limit {summary['timeout_minutes']})", flush=True)
for r in summary['failed']:
    print(f"  FAILED [{r['i']}] {r['name']} — {r['status']}, {r['secs']}s", flush=True)
sys.exit(1 if summary['failed'] else 0)
