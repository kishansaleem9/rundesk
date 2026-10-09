import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import {
  PHOTO_ID,
  PHOTO_QUERY_MAX,
  PhotoLibraryFailed,
  photoLibraryConfig,
  searchPhotos,
  trackPhotoUse,
} from './photo-library'

/** What a refusal of the library is said as: its rate limit as ours, anything else as a library that did not answer. */
export function libraryRefusal(err: unknown): HttpException {
  if (err instanceof PhotoLibraryFailed && (err.status === 403 || err.status === 429)) {
    return new HttpException('The photo library has had too many searches for now — try again in a while', HttpStatus.TOO_MANY_REQUESTS)
  }
  return new BadGatewayException('The photo library did not answer — try again')
}

/**
 * A cover's Search tab (`commit-log/log-601eacc-1`, `ledger-rows/row-739`):
 * the stock photo library, searched for the workspace's members, and a photo
 * chosen from it reported as used, as Unsplash asks. Setting the cover is the
 * cover's own write, which asks the task's rule; this only finds photographs.
 */
@ApiTags('covers')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/cover-photos')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class CoverPhotosController {
  @Get()
  async search(
    @Param('workspaceId', new ParseUUIDPipe()) _workspaceId: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
  ) {
    const cfg = photoLibraryConfig()
    if (!cfg) throw new ServiceUnavailableException('Photo search is not set up on this server')
    const query = (q ?? '').trim()
    if (!query) throw new BadRequestException('Say what to search for')
    if (query.length > PHOTO_QUERY_MAX) throw new BadRequestException(`A search is ${PHOTO_QUERY_MAX} characters at most`)
    const n = page === undefined ? 1 : Number(page)
    if (!Number.isInteger(n) || n < 1 || n > 50) throw new BadRequestException('The page is a whole number from 1 to 50')
    try {
      return await searchPhotos(cfg, query, n)
    } catch (err) {
      throw libraryRefusal(err)
    }
  }

  @Post(':photoId/use')
  @HttpCode(204)
  async use(@Param('workspaceId', new ParseUUIDPipe()) _workspaceId: string, @Param('photoId') photoId: string) {
    const cfg = photoLibraryConfig()
    if (!cfg) throw new ServiceUnavailableException('Photo search is not set up on this server')
    if (!PHOTO_ID.test(photoId)) throw new BadRequestException('That is not a photo of the library')
    try {
      await trackPhotoUse(cfg, photoId)
    } catch (err) {
      if (err instanceof PhotoLibraryFailed && err.status === 404) throw new BadRequestException('That is not a photo of the library')
      throw libraryRefusal(err)
    }
  }
}
