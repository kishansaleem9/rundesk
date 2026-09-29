/*
 * A MUTANT RUN ENDS WITH EVERYTHING IT STARTED.
 *
 * spawnSync's timeout signals the child alone. The stub gates' mutants each
 * start a stub and a `tsx` probe, and name the probe's file after their own
 * pid. A mutant ended mid-probe left its stub listening and its probe file in
 * apps/api: sixteen mutant stubs were found still listening 46 minutes after
 * the run that ended them, and the next `git add -A` staged eleven probe files
 * (`found-29-sep/killed-mutants-outlive-their-run`). A mutant that dies on its
 * own, before it can stop its stub, leaves it the same way.
 *
 * So the child leads its own process group. When the run returns, however it
 * ended, the group is ended with it, and whatever the caller says the child
 * names after its pid is removed.
 */
import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

/**
 * @param {string[]} args  arguments to this node binary
 * @param {object} [o]
 * @param {NodeJS.ProcessEnv} [o.env]
 * @param {number} [o.timeout]  ms before the child is signalled
 * @param {(pid: number) => string[]} [o.leftBehind]  files the child names after its pid
 */
export const runMutant = (args, { env = process.env, timeout = 180_000, leftBehind = () => [] } = {}) => {
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout, env, detached: true })
  if (r.pid) {
    try {
      process.kill(-r.pid, 'SIGKILL')
    } catch {
      // ESRCH: nothing the run started is still running.
    }
    for (const file of leftBehind(r.pid)) rmSync(file, { force: true })
  }
  return r
}
