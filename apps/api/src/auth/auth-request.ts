import type { Request } from 'express';
import type { ActiveSession } from './session/session.service';

export type AuthRequest = Request & {
  activeSession?: ActiveSession;
  authRequestId?: string;
};
