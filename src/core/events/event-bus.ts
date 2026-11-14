import { DomainEvent } from './events';

type EventHandler<T extends DomainEvent['type']> = (
  payload: Extract<DomainEvent, { type: T }>['payload']
) => Promise<void> | void;

class EventBus {
  private handlers = new Map<string, EventHandler<any>[]>();

  public subscribe<T extends DomainEvent['type']>(type: T, handler: EventHandler<T>): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  public async publish(event: DomainEvent): Promise<void> {
    const eventHandlers = this.handlers.get(event.type);
    if (!eventHandlers || eventHandlers.length === 0) {
      console.warn(`[EventBus] No handlers registered for domain event: ${event.type}`);
      return;
    }

    for (const handler of eventHandlers) {
      try {
        await handler(event.payload);
      } catch (error) {
        console.error(`[EventBus] Error executing handler for ${event.type}:`, error);
        throw error;
      }
    }
  }
}

export const appEventBus = new EventBus();
