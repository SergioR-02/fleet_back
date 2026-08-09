import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ApiErrorCode } from '../common/errors/api-error-codes';
import { apiError } from '../common/errors/api-error';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { driver: true },
    });

    if (!user) {
      throw new UnauthorizedException(
        apiError(ApiErrorCode.INVALID_CREDENTIALS, 'Invalid credentials'),
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException(
        apiError(ApiErrorCode.INVALID_CREDENTIALS, 'Invalid credentials'),
      );
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      driverId: user.driverId,
    };

    const accessToken = await this.jwt.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.driver?.name ?? user.email.split('@')[0],
        driverId: user.driverId,
      },
    };
  }
}
