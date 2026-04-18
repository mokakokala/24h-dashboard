import type { Request, Response, NextFunction } from 'express'
import type { ApiResponse } from '../types.js'

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('❌ Error:', err.message)
  const response: ApiResponse = {
    success: false,
    error: err.message,
    timestamp: new Date().toISOString(),
  }
  const statusCode = err.message.includes('not RUNNING') || err.message.includes('not in TRANSITION')
    ? 409
    : 500
  res.status(statusCode).json(response)
}
