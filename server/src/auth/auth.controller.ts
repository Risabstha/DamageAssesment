import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  me(@Req() req: Request) { return { username: this.auth.current(req)?.username ?? null }; }

  @Post('register')
  register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) { return this.auth.register(body, res); }

  @Post('login')
  login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) { return this.auth.login(body, res); }

  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) { return this.auth.logout(req, res); }
}
