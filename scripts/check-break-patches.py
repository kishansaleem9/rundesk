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

BREAKS = '/tmp/claude-0/breaks'
ROOT = '/home/user/rundesk'

_real_open = builtins.open
_real_io_open = _io.open


def _dirty():
    return subprocess.run(
        ['git', 'status', '--porcelain'], cwd=ROOT, capture_output=True, text=True, check=False
    ).stdout


BEFORE = _dirty()


class _Sink(_io.StringIO):
    """A writable file that keeps nothing. The patch believes it wrote."""

    def close(self):  # StringIO.close would discard the buffer we never read
        pass


def _guarded_open(path, mode='r', *args, **kwargs):
    if any(c in mode for c in 'wax+'):
        return _Sink()
    return _real_io_open(path, mode, *args, **kwargs)


patches = sorted(glob.glob(os.path.join(BREAKS, '*.py')))
if not patches:
    print('[break-patches] no patches on this machine — nothing to check')
    sys.exit(0)

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
    except Exception:  # a broken patch is a finding, not a crash
        err.append((name, traceback.format_exc(limit=1).strip().splitlines()[-1]))
    finally:
        _io.open = _real_io_open
        builtins.open = _real_open
        sys.stdout = real_stdout

AFTER = _dirty()
if AFTER != BEFORE:
    print('[break-patches] ABORT — this run CHANGED THE WORKING TREE. Restore with:', file=sys.stderr)
    print('    git -C %s checkout -- .' % ROOT, file=sys.stderr)
    print(AFTER, file=sys.stderr)
    sys.exit(2)

for tag, rows in (('ANCHOR GONE  ', miss), ('ANCHOR DOUBLE', dupe), ('FILE GONE    ', gone), ('PATCH ERROR  ', err)):
    for name, msg in rows:
        print(f'{tag} {name}\n              {msg}')

bad = len(miss) + len(dupe) + len(gone) + len(err)
print(f'\n[break-patches] {ok} of {len(patches)} patches still apply cleanly; {bad} would fail')
print('[break-patches] working tree unchanged — verified against git status')
sys.exit(1 if bad else 0)
