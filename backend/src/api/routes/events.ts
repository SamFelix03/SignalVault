import { Router, type Request, type Response } from 'express';
import { eventBus } from '../../services/event-bus';

export const eventsRouter = Router();

eventsRouter.get('/', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send({ type: 'connected', timestamp: Date.now() });

  const onEvent = (payload: unknown) => send(payload);
  eventBus.on('event', onEvent);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.off('event', onEvent);
  });
});
