#!/usr/bin/env python3
"""Dry-apply every break patch against the working tree and report the misses.

A BREAK PATCH THAT CANNOT FIND ITS LINE IS A CHECK WITH NO BASELINE. The process
file has said so since `sidebar-sections-12` anchored on a `return` that a later
branch moved. What it could not say is WHICH of the five-hundred-odd patches on
this machine are in that state right now, because the only way to find out was
to run a set — eight minutes a set, and the answer arrives inside a long log as
one `PATCH FAILED` line among the passes.

Every patch asserts `s.count(a) == 1` before writing, and that assertion is a
complete, cheap test of whether the patch still knows where it is going. This
runs all of them with writes redirected to nowhere, and prints the ones whose
anchor now matches zero times (the code moved) or more than once (the code was
duplicated, which is its own defect and the reason the assertion is `== 1`).

THE FIRST VERSION OF THIS SCRIPT EDITED 62 SOURCE FILES WHILE CLAIMING TO BE A
DRY RUN. It seeded a fake `io` into each patch's globals — and every patch
begins `import io`, which rebinds the name to the real module on the first line,
so the guard was gone before the write. The patches then ran for real, each one
against a tree the previous ones had already modified, and the run's own output
(57 "anchor gone") was largely an artefact of the damage it was doing. Nothing
was lost because the work was committed and `git checkout -- .` restored it, but
the lesson is the one this audit keeps paying for: A CHECK THAT CANNOT SAY WHAT
IT DID TO THE THING IT MEASURED IS NOT A CHECK. So the patch now goes on the
real `io.open`, restored in `finally`, and the script verifies `git status`
before and after and ABORTS if a single file changed.
"""
import io as _io
import builtins
import glob
import os
import subprocess
import sys
import traceback

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# THE TRACKED COPY IS THE ONE THAT MATTERS. `/tmp/claude-0/breaks` is where the
# runner reads from on this machine and where they lived until they were
# committed; the repository is what CI has and what survives the container.
BREAKS = os.path.join(ROOT, 'test/e2e/breaks')
if not os.path.isdir(BREAKS):
    # AND IT SAYS SO, rather than substituting in silence. The patches are
    # committed now, so this fallback can only ever fire when the tracked copy
    # has gone missing — and then a clean pass read from an untracked scratch
    # directory is the worst possible answer. The floor below would be met by
    # that copy and prove nothing about the repository.
    print(
        '[break-patches] WARNING: %s does not exist; falling back to /tmp/claude-0/breaks.\n'
        '                The tracked copy is the one that matters — this result is about a\n'
        '                scratch directory, not about the repository.' % BREAKS
    )
    BREAKS = '/tmp/claude-0/breaks'

_real_open = builtins.open
_real_io_open = _io.open


def _dirty_one(root):
    """One working tree's dirt, or a refusal.

    THE GUARD MUST NOT BE ABLE TO PASS BY ACCIDENT. The first version returned
    `.stdout` and ignored the exit code, so anywhere without a `.git` — an
    export, a tarball, a container that clones shallowly into a plain directory
    — `git status` failed, the output was empty, and BEFORE == AFTER == '' said
    "nothing changed" about a check that had no way to tell. Found by running
    the checker from a `git archive` copy to test something else entirely.
    """
    r = subprocess.run(
        ['git', 'status', '--porcelain'], cwd=root, capture_output=True, text=True, check=False
    )
    if r.returncode != 0:
        print(
            f'[break-patches] REFUSING: `git status` failed in {root}, so this run could not '
            'tell whether it modified your files. These patches WRITE; the only thing making '
            'this safe is being able to check afterwards.',
            file=sys.stderr,
        )
        sys.exit(2)
    return r.stdout


# WATCH EVERY TREE A PATCH COULD REACH, NOT THE ONE THIS SCRIPT LIVES IN.
#
# The second version watched `ROOT` alone, and that is wrong in the exact case
# the `_here()` rewriting exists for. Every patch hardcodes `/home/user/rundesk`.
# If the shim leaks, the write goes to THAT path — not to the checkout the
# script was launched from. Running the checker inside a clone with the shim
# disabled, to prove the guard worked, rewrote 61 files in the ORIGINAL repo
# while the clone's own status stayed clean, and the script printed
#
#     [break-patches] working tree unchanged — verified against git status
#
# over the top of it. A guard reporting on the wrong tree is worse than no
# guard: it is the facade, in the thing written to detect facades. Both roots
# are watched now, and a `git status` that cannot run in either is a refusal.
HARDCODED = '/home/user/rundesk'

WATCHED = [ROOT]
if os.path.isdir(HARDCODED) and os.path.abspath(HARDCODED) != os.path.abspath(ROOT):
    WATCHED.append(HARDCODED)


def _dirty():
    return {root: _dirty_one(root) for root in WATCHED}


BEFORE = _dirty()


class _Sink(_io.StringIO):
    """A writable file that keeps nothing. The patch believes it wrote."""

    def close(self):  # StringIO.close would discard the buffer we never read
        pass


def _here(path):
    """Map the patch's hardcoded repo root onto this checkout.

    `wt-break.sh` does the same thing when it applies a patch to a worktree —
    the patches say `/home/user/rundesk/...` and the runner rewrites it. Without
    this the check passes vacuously anywhere else (every file "missing") or, in
    CI, fails every patch for a reason that has nothing to do with the anchors.
    """
    p = str(path)
    if p.startswith(HARDCODED + '/') and ROOT != HARDCODED:
        return os.path.join(ROOT, p[len(HARDCODED) + 1 :])
    return p


def _guarded_open(path, mode='r', *args, **kwargs):
    if any(c in mode for c in 'wax+'):
        return _Sink()
    return _real_io_open(_here(path), mode, *args, **kwargs)


# A FLOOR, BECAUSE "NOTHING TO CHECK" WAS AN EXIT 0 AND THIS RUNS IN CI.
#
# `if not patches: print('no patches on this machine'); sys.exit(0)` is the
# check-that-cannot-fail shape, and unlike `check-break-reddened.mjs` — which is
# preflight-only for exactly that reason — this is a CI step. A breaks directory
# that went missing, or a fallback that resolved to an empty `/tmp/claude-0/breaks`,
# would report success over nothing on every push.
#
# The patches are tracked, so the number is knowable rather than guessed.
# Measured 22 September: 809. A floor rather than an equality because the set
# grows; lowering it is legitimate only when patches were genuinely deleted, and
# then it is said here with which ones and why — the same rule the break
# ratchets keep.
MIN_PATCHES = 750
patches = sorted(glob.glob(os.path.join(BREAKS, '*.py')))
if len(patches) < MIN_PATCHES:
    print(
        '[break-patches] found %d patch(es) under %s, below the floor of %d.'
        % (len(patches), BREAKS, MIN_PATCHES)
    )
    print(
        '                This used to be "nothing to check" and an exit 0. A scan of an empty\n'
        '                directory proves nothing about whether the patches apply, and this step\n'
        '                runs in CI, so the pass would be reported on every push.'
    )
    sys.exit(1)

miss, dupe, gone, err, ok = [], [], [], [], 0

for path in patches:
    name = os.path.basename(path)[:-3]
    src = _real_io_open(path, encoding='utf-8').read()
    out = _io.StringIO()
    real_stdout, sys.stdout = sys.stdout, out
    # ON THE REAL MODULE, because `import io` in the patch resolves to it.
    _io.open = _guarded_open
    builtins.open = _guarded_open
    try:
        exec(compile(src, path, 'exec'), {'__name__': '__main__'})  # our own files
        ok += 1
    except AssertionError as e:
        msg = ' '.join(str(e).split()) or '(no message)'
        (dupe if 'appears 2' in msg or 'occurs 2' in msg else miss).append((name, msg))
    except FileNotFoundError as e:
        gone.append((name, f'{e.filename} no longer exists'))
    except SystemExit as e:
        # SIX PATCHES STOP WITH `sys.exit('anchor %d times' % n)` INSTEAD OF THE
        # ASSERT, and `SystemExit` is not an `Exception`: the first of them to
        # lose its anchor ended THIS RUN — no report, no patch named, just
        # "anchor 0 times" and exit 1 (found 23 September, `lwb-1-noorder`).
        # So an exit is the patch's verdict, read like the assert's.
        msg = ' '.join(str(e.code).split()) if e.code not in (None, 0) else ''
        if not msg:
            ok += 1
        else:
            (dupe if 'anchor 2' in msg or 'appears 2' in msg else miss).append((name, msg))
    except Exception:  # a broken patch is a finding, not a crash
        err.append((name, traceback.format_exc(limit=1).strip().splitlines()[-1]))
    finally:
        _io.open = _real_io_open
        builtins.open = _real_open
        sys.stdout = real_stdout

AFTER = _dirty()
changed = [r for r in WATCHED if AFTER[r] != BEFORE[r]]
if changed:
    for root in changed:
        print(f'[break-patches] ABORT — this run CHANGED FILES IN {root}. Restore with:', file=sys.stderr)
        print(f'    git -C {root} checkout -- .', file=sys.stderr)
        was, now = set(BEFORE[root].splitlines()), set(AFTER[root].splitlines())
        for line in sorted(now - was):
            print(f'      {line}', file=sys.stderr)
    sys.exit(2)

for tag, rows in (('ANCHOR GONE  ', miss), ('ANCHOR DOUBLE', dupe), ('FILE GONE    ', gone), ('PATCH ERROR  ', err)):
    for name, msg in rows:
        print(f'{tag} {name}\n              {msg}')

bad = len(miss) + len(dupe) + len(gone) + len(err)
print(f'\n[break-patches] {ok} of {len(patches)} patches still apply cleanly; {bad} would fail')
print('[break-patches] unchanged, verified with git status in: ' + ', '.join(WATCHED))
sys.exit(1 if bad else 0)
