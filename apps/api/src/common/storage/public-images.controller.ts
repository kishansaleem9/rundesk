import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { R2Service } from './r2.service'
import { isKeyDirectlyUnder } from './object-key-shape'

/**
 * The pictures people put on show — avatars and workspace logos — and nothing
 * else. A key under any other prefix is an attachment, a clip, a document: a
 * private object this route must not hand out however its key is written.
 */
export const PUBLIC_IMAGE_PREFIXES = ['avatars/', 'workspace-logos/'] as const

/** The stable address an uploaded avatar or logo is saved as. */
export function publicImagePath(key: string): string {
  return `/api/v1/public/images/${key}`
}

/**
 * Whether `url` is the address of a picture we store under `prefix`, as
 * `publicImagePath` names an upload: one safe segment under it, so no `..`
 * walks to another object. A picture was saved as whatever string arrived, so
 * it could point at any host, and every viewer's browser would ask that host
 * for it (`found-23-sep/avatar-and-logo-accept-any-url`). ClickUp takes an
 * upload and nothing else.
 */
export function isPublicImagePath(url: unknown, prefix: (typeof PUBLIC_IMAGE_PREFIXES)[number]): boolean {
  const base = publicImagePath('')
  return typeof url === 'string' && url.startsWith(base) && isKeyDirectlyUnder(url.slice(base.length), prefix)
}

/**
 * AN AVATAR OR LOGO AT AN ADDRESS THAT DOES NOT EXPIRE.
 *
 * Uploads saved `getObjectUrl(key)` as the picture's URL — and without a public
 * R2/CDN domain (`R2_PUBLIC_URL` is optional and empty in the production
 * template) that is a presigned GET that expires in 900 seconds. So on a
 * default deployment every uploaded avatar and logo became a broken image a
 * quarter of an hour after it was set, everywhere it was shown.
 *
 * The saved URL is this route now; each request is answered with a redirect to
 * a freshly signed URL, cached for less than that URL lives. Unauthenticated
 * like the pictures themselves (a logo is drawn on the custom-domain sign-in
 * page, before anybody signs in); the key's shape is checked, so no `..` or
 * extra segment reaches another object.
 */
@ApiTags('public-images')
@Controller('public/images')
export class PublicImagesController {
  constructor(private readonly r2: R2Service) {}

  @Get(':folder/:name')
  async show(@Param('folder') folder: string, @Param('name') name: string, @Res() reply: FastifyReply) {
    const key = `${folder}/${name}`
    if (!this.r2.configured || !PUBLIC_IMAGE_PREFIXES.some((prefix) => isKeyDirectlyUnder(key, prefix))) {
      throw new NotFoundException('Image not found')
    }
    const url = await this.r2.getObjectUrl(key)
    // Ten minutes, inside the fifteen the signed URL lives.
    return reply.header('Cache-Control', 'public, max-age=600').redirect(url, 302)
  }
}
