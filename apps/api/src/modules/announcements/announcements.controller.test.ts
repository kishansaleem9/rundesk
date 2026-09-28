import 'reflect-metadata'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { PermissionsGuard } from '../custom-roles/permissions.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { AnnouncementsController } from './announcements.controller'
import { AnnouncementsService } from './announcements.service'
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto'

/**
 * `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`, the
 * announcements slice. Publishing, editing, deleting and the full list ask
 * `announcement.manage`; the live banner, a view and a dismissal ask
 * membership alone. And a title is a title: none, or blank, is a 400.
 */

const REQUIRED = 'rundesk.required_permissions'
const proto = AnnouncementsController.prototype as unknown as Record<string, object>

describe('AnnouncementsController', () => {
  it('asks announcement.manage to publish, edit, delete and read the full list', () => {
    for (const route of ['list', 'create', 'update', 'remove']) {
      assert.deepEqual(Reflect.getMetadata(REQUIRED, proto[route]), ['announcement.manage'], `${route} asks announcement.manage`)
      const guards = Reflect.getMetadata(GUARDS_METADATA, proto[route]) ?? []
      assert.ok(guards.includes(WorkspaceMemberGuard), `${route} is guarded by WorkspaceMemberGuard`)
      assert.ok(guards.includes(PermissionsGuard), `${route} is guarded by PermissionsGuard`)
    }
  })

  it('leaves the live banner, a view and a dismissal to every member: they ask no key', () => {
    for (const route of ['listActive', 'trackView', 'dismiss']) {
      assert.equal(Reflect.getMetadata(REQUIRED, proto[route]), undefined, `${route} asks no key`)
      const guards = Reflect.getMetadata(GUARDS_METADATA, proto[route]) ?? []
      assert.ok(guards.includes(WorkspaceMemberGuard), `${route} asks membership`)
      assert.ok(!guards.includes(PermissionsGuard), `${route} asks no permission`)
    }
  })
})

describe('announcement bodies', () => {
  const errorsOf = async (cls: new () => object, body: object) =>
    (await validate(plainToInstance(cls, body), { whitelist: true })).map((e) => e.property)

  it('refuses a publish with no title, or a blank one', async () => {
    assert.deepEqual(await errorsOf(CreateAnnouncementDto, { body: 'hello' }), ['title'])
    assert.deepEqual(await errorsOf(CreateAnnouncementDto, { title: '   ' }), ['title'])
    assert.deepEqual(await errorsOf(CreateAnnouncementDto, { title: 'Launch', tone: 'celebrate', isActive: false, expiresAt: '2026-10-01' }), [])
    assert.deepEqual(await errorsOf(CreateAnnouncementDto, { title: 'Launch', expiresAt: null }), [])
  })

  it('refuses an edit that blanks the title, and lets one that leaves it alone through', async () => {
    assert.deepEqual(await errorsOf(UpdateAnnouncementDto, { title: '' }), ['title'])
    assert.deepEqual(await errorsOf(UpdateAnnouncementDto, { title: '  ' }), ['title'])
    assert.deepEqual(await errorsOf(UpdateAnnouncementDto, { isActive: false }), [])
  })

  it('refuses a tone or an expiry it does not know', async () => {
    assert.deepEqual(await errorsOf(CreateAnnouncementDto, { title: 'x', tone: 'shout' }), ['tone'])
    assert.deepEqual(await errorsOf(CreateAnnouncementDto, { title: 'x', expiresAt: 'soon' }), ['expiresAt'])
  })
})

describe('AnnouncementsService titles', () => {
  // Refused before the database is touched: a db that throws proves it.
  const untouchable = new Proxy({}, { get: () => { throw new Error('the database was reached') } })
  const service = new AnnouncementsService(untouchable as never, { logAuditEvent: async () => {} } as never)

  it('answers a publish with no title with a 400, not a 500', async () => {
    await assert.rejects(service.create('ws-1', 'u-1', {} as never), BadRequestException)
    await assert.rejects(service.create('ws-1', 'u-1', { title: '  ' }), BadRequestException)
  })

  it('answers an edit to an empty title with a 400', async () => {
    await assert.rejects(service.update('ws-1', 'a-1', { title: '' }, 'u-1'), BadRequestException)
    await assert.rejects(service.update('ws-1', 'a-1', { title: null }, 'u-1'), BadRequestException)
  })
})
