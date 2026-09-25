import { HttpException } from '@nestjs/common';
import { json, urlencoded } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

// body-parser errors (and Nest's SyntaxError mapping) echo fragments of the submitted
// body in their messages. Replace them with a fixed message, keeping the client status.
export function redactBodyErrors(parser: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void parser(req, res, (error?: unknown) => {
      if (!error) return next();
      const { status, expose } = error as {
        status?: unknown;
        expose?: unknown;
      };
      if (
        expose === true &&
        typeof status === 'number' &&
        status >= 400 &&
        status < 500
      ) {
        return next(
          new HttpException(
            { message: 'The request body could not be read.' },
            status,
          ),
        );
      }
      next(error);
    });
  };
}

export const bodyParsers = [
  redactBodyErrors(json({ limit: '100kb' })),
  redactBodyErrors(urlencoded({ extended: false, limit: '100kb' })),
];
