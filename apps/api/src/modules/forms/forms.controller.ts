import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { FormsService } from './forms.service'
import { CreateFormDto, AddFormFieldDto, SubmitFormDto } from './dto/form.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

// ─── Workspace-scoped routes (JWT-protected) ──────────────────────────────────
@ApiTags('forms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/forms')
export class WorkspaceFormsController {
  constructor(private readonly formsService: FormsService) {}

  @Get()
  @ApiOperation({ summary: 'List all forms in a workspace' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query('archived') archived?: string,
  ) {
    return this.formsService.listForms(workspaceId, archived === 'true')
  }

  @Post()
  @ApiOperation({ summary: 'Create a new form' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: CreateFormDto,
  ) {
    return this.formsService.createForm(workspaceId, user.id, body)
  }

  @Get(':formId')
  @ApiOperation({ summary: 'Get a form with its fields' })
  getOne(@Param('formId') formId: string) {
    return this.formsService.getForm(formId)
  }

  @Patch(':formId')
  @ApiOperation({ summary: 'Update form settings' })
  update(
    @Param('formId') formId: string,
    @Body()
    body: {
      title?: string
      description?: string
      targetListId?: string | null
      isPublic?: boolean
      isEnabled?: boolean
      confirmationMsg?: string
      coverImageUrl?: string | null
    },
  ) {
    return this.formsService.updateForm(formId, body)
  }

  @Post(':formId/duplicate')
  @ApiOperation({ summary: 'Duplicate a form' })
  duplicate(@Param('formId') formId: string, @CurrentUser() user: any) {
    return this.formsService.duplicateForm(formId, user.id)
  }

  @Patch(':formId/archive')
  @ApiOperation({ summary: 'Archive a form' })
  archive(@Param('formId') formId: string) {
    return this.formsService.archiveForm(formId)
  }

  @Delete(':formId')
  @ApiOperation({ summary: 'Delete a form permanently' })
  delete(@Param('formId') formId: string) {
    return this.formsService.deleteForm(formId)
  }

  // ─── Fields ──────────────────────────────────────────────────────────────
  @Post(':formId/fields')
  addField(
    @Param('formId') formId: string,
    @Body() body: AddFormFieldDto,
  ) {
    return this.formsService.addField(formId, body)
  }

  @Patch(':formId/fields/:fieldId')
  updateField(@Param('fieldId') fieldId: string, @Body() body: any) {
    return this.formsService.updateField(fieldId, body)
  }

  @Delete(':formId/fields/:fieldId')
  deleteField(@Param('fieldId') fieldId: string) {
    return this.formsService.deleteField(fieldId)
  }

  @Put(':formId/fields/reorder')
  reorderFields(@Param('formId') formId: string, @Body() body: { orderedIds: string[] }) {
    return this.formsService.reorderFields(formId, body.orderedIds)
  }

  // ─── Submissions ──────────────────────────────────────────────────────────
  @Get(':formId/submissions')
  listSubmissions(@Param('formId') formId: string) {
    return this.formsService.listSubmissions(formId)
  }

  @Get(':formId/submissions/:submissionId/files/:fieldId')
  @ApiOperation({ summary: 'Signed download URL for a file a submitter uploaded' })
  submissionFile(
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
    @Param('fieldId') fieldId: string,
    @CurrentUser() user: any,
  ) {
    return this.formsService.getSubmissionFileUrl(formId, submissionId, fieldId, user.id)
  }

  @Post(':formId/submissions/:submissionId/retry-routing')
  retrySubmissionRouting(
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.formsService.retrySubmissionRouting(formId, submissionId)
  }

  @Delete(':formId/submissions/:submissionId/retry-history')
  clearSubmissionRetryHistory(
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.formsService.clearSubmissionRetryHistory(formId, submissionId)
  }
}

// ─── Public routes (no JWT) ───────────────────────────────────────────────────
@ApiTags('forms-public')
@Controller('forms')
export class PublicFormsController {
  constructor(private readonly formsService: FormsService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Get a public form by slug (no auth required)' })
  getBySlug(@Param('slug') slug: string) {
    return this.formsService.getFormBySlug(slug)
  }

  @Post(':slug/submit')
  @ApiOperation({ summary: 'Submit a form response (no auth required)' })
  submit(
    @Param('slug') slug: string,
    @Body() body: SubmitFormDto,
  ) {
    return this.formsService.submitForm(slug, body.data ?? {}, body.submitterEmail, body.submitterName)
  }

  @Post(':slug/attachments/presign')
  @ApiOperation({ summary: 'Presign a file upload for a public form field (no auth required)' })
  presignUpload(
    @Param('slug') slug: string,
    @Body() body: { fileName: string; contentType: string; sizeBytes?: number },
  ) {
    return this.formsService.createUploadUrl(slug, body)
  }
}
