import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalogs } from './catalogs'

/*
 * WHO A CLICKAPP ASK REACHES, AS THE GATE SAYS IT. The ask goes to whoever
 * holds `workspace.clickapps.manage` (`admin-guard-admits-managers-where-the-web-says-admin`),
 * and the gate's answers said "your workspace admins"; sign-up pointed at
 * "Admin → Features", the platform console
 * (found-28-sep/copy-points-admins-to-the-console). The gate opens only on a
 * plan-locked action, so its four answers are read here, in every locale, as
 * the page reads them.
 */
const GATE_ANSWERS = ['gate.sent', 'gate.sentButSilent', 'gate.noAdmins', 'gate.failed'] as const

test('the gate’s answers name the people who manage ClickApps, not admins', () => {
  for (const key of GATE_ANSWERS) {
    assert.match(catalogs.en[key], /manage(s)? ClickApps/, `${key} in English`)
    assert.doesNotMatch(catalogs.en[key], /\badmins?\b/i, `${key} in English`)
  }
})

test('every locale names ClickApps in those answers, as English does', () => {
  for (const locale of ['es', 'ar', 'ur'] as const) {
    for (const key of GATE_ANSWERS) {
      assert.match(catalogs[locale][key], /ClickApps/, `${key} in ${locale}`)
    }
  }
})

test('sign-up sends the choice to Settings, not the admin console', () => {
  assert.match(catalogs.en['signUp.featuresSubtitle'], /Settings → Features/)
  assert.doesNotMatch(catalogs.en['signUp.featuresSubtitle'], /Admin → Features/)
})
