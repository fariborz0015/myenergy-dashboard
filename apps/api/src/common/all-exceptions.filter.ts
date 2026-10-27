import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/** Uniform JSON errors; maps common Prisma errors to HTTP codes. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const { status, message } = this.describe(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : exception);
    const body: ErrorBody = {
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(body);
  }

  private describe(e: unknown): { status: number; message: string | string[] } {
    if (e instanceof HttpException) {
      const r = e.getResponse();
      const message =
        typeof r === 'object' && r !== null && 'message' in r
          ? (r as { message: string | string[] }).message
          : e.message;
      return { status: e.getStatus(), message };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return { status: 404, message: 'Record not found' };
      if (e.code === 'P2002') return { status: 409, message: 'Record already exists' };
      return { status: 400, message: `Database error ${e.code}` };
    }
    return { status: 500, message: 'Internal server error' };
  }
}
