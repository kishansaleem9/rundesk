import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ContainerMembersService } from './container-members.service'

@ApiTags('container-members')
@ApiBearerAuth()
@Controller('spaces/:spaceId')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class SpaceMembersController {
  constructor(private members: ContainerMembersService) {}

  @Get('members')
  list(@Param('spaceId') spaceId: string) {
    return this.members.listSpaceMembers(spaceId)
  }

  @Post('members')
  add(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
    @Body() body: { userId: string; role?: string },
  ) {
    return this.members.addSpaceMember(spaceId, user.id, body.userId, body.role)
  }

  @Patch('members/:userId')
  updateRole(
    @Param('spaceId') spaceId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
    @Body() body: { role: string },
  ) {
    return this.members.updateSpaceMemberRole(spaceId, user.id, userId, body.role)
  }

  @Delete('members/:userId')
  remove(
    @Param('spaceId') spaceId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    return this.members.removeSpaceMember(spaceId, user.id, userId)
  }

  @Patch('visibility')
  setVisibility(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
    @Body() body: { visibility: string },
  ) {
    return this.members.setSpaceVisibility(spaceId, user.id, body.visibility)
  }
}
