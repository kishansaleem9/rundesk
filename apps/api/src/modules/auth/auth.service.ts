import { Injectable, UnauthorizedException, ConflictException, Inject } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { compareSync, hashSync } from 'bcryptjs'
import { users, sessions } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { UsersService } from '../users/users.service'
import { WorkspacesService } from '../workspaces/workspaces.service'
import { FeatureFlagsService } from '../feature-flags/feature-flags.service'
import type { RegisterDto } from './dto/register.dto'

type SessionMeta = { userAgent?: string; ip?: string }

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private usersService: UsersService,
    private workspacesService: WorkspacesService,
    private jwtService: JwtService,
    private config: ConfigService,
    private featureFlagsService: FeatureFlagsService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email)
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials')
    if (!compareSync(password, user.passwordHash)) throw new UnauthorizedException('Invalid credentials')
    if (!user.isActive) throw new UnauthorizedException('Account is disabled')
    return user
  }

  async login(user: typeof users.$inferSelect, meta: SessionMeta = {}) {
    const memberships = await this.workspacesService.findByMember(user.id)
    const primaryWorkspaceId = memberships[0]?.workspace.id ?? null

    const resolvedFlags = await this.featureFlagsService.resolveForUser({
      userId: user.id,
      workspaceId: primaryWorkspaceId ?? '',
      role: user.role,
    })

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      workspaceId: primaryWorkspaceId,
      flags: resolvedFlags.flags,
    })

    const refreshToken = this.jwtService.sign(
      // jti guarantees a fresh token even when two logins happen in the same second
      // (otherwise iat is identical and the sessions.refreshToken unique constraint fires).
      { sub: user.id, type: 'refresh', jti: randomUUID() },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      },
    )

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await this.db.insert(sessions).values({
      userId: user.id,
      refreshToken,
      userAgent: meta.userAgent,
      ipAddress: meta.ip,
      expiresAt,
    })

    const { passwordHash: _discard, ...safeUser } = user
    return {
      accessToken,
      refreshToken,
      user: safeUser,
      workspaces: memberships.map((m) => ({ ...m.workspace, role: m.role })),
    }
  }

  async register(dto: RegisterDto, meta: SessionMeta = {}) {
    const existing = await this.usersService.findByEmail(dto.email)
    if (existing) throw new ConflictException('Email already in use')

    const user = await this.usersService.create({
      email: dto.email,
      displayName: dto.displayName,
      passwordHash: hashSync(dto.password, 12),
    })

    // Every new signup gets a personal workspace so the UI has somewhere to land.
    await this.workspacesService.createPersonalWorkspace(user.id, user.displayName)

    return this.login(user, meta)
  }

  async refresh(token: string, meta: SessionMeta = {}) {
    let payload: any
    try {
      payload = this.jwtService.verify(token, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      })
    } catch {
      throw new UnauthorizedException('Invalid refresh token')
    }

    const [session] = await this.db.select().from(sessions).where(eq(sessions.refreshToken, token))
    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired')
    }

    const user = await this.usersService.findById(payload.sub)
    if (!user) throw new UnauthorizedException()

    // Rotate refresh token on use: revoke the old session row, create a new one inside login().
    await this.db.update(sessions).set({ isRevoked: true }).where(eq(sessions.id, session.id))

    return this.login(user, meta)
  }

  async logout(refreshToken: string) {
    await this.db
      .update(sessions)
      .set({ isRevoked: true })
      .where(eq(sessions.refreshToken, refreshToken))
  }
}
