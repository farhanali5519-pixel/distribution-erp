interface RateLimitEntry {
  attempts: number[];
}

export class RateLimiter {
  private static store = new Map<string, RateLimitEntry>();
  private static defaultMaxAttempts = 5;
  private static defaultWindowMs = 15 * 60 * 1000; // 15 minutes

  /**
   * Cleans up stale timestamps older than the window
   */
  private static cleanup(key: string, windowMs: number): void {
    const entry = this.store.get(key);
    if (!entry) return;

    const cutoff = Date.now() - windowMs;
    entry.attempts = entry.attempts.filter(t => t > cutoff);

    if (entry.attempts.length === 0) {
      this.store.delete(key);
    }
  }

  /**
   * Checks whether the current key has exceeded the allowed attempts
   */
  public static checkLimit(
    key: string, 
    maxAttempts: number = this.defaultMaxAttempts, 
    windowMs: number = this.defaultWindowMs
  ): { isAllowed: boolean; attemptsMade: number; remainingAttempts: number; resetMs: number } {
    this.cleanup(key, windowMs);
    const entry = this.store.get(key);
    const attemptsMade = entry ? entry.attempts.length : 0;
    const isAllowed = attemptsMade < maxAttempts;
    const remainingAttempts = Math.max(0, maxAttempts - attemptsMade);

    let resetMs = 0;
    if (entry && entry.attempts.length > 0) {
      const oldestAttempt = entry.attempts[0];
      resetMs = Math.max(0, (oldestAttempt + windowMs) - Date.now());
    }

    return { isAllowed, attemptsMade, remainingAttempts, resetMs };
  }

  /**
   * Records a failed attempt for the given key
   */
  public static recordFailedAttempt(
    key: string, 
    windowMs: number = this.defaultWindowMs
  ): void {
    this.cleanup(key, windowMs);
    const entry = this.store.get(key) || { attempts: [] };
    entry.attempts.push(Date.now());
    this.store.set(key, entry);
  }

  /**
   * Clears all recorded attempts on successful login/authentication
   */
  public static clearAttempts(key: string): void {
    this.store.delete(key);
  }
}
