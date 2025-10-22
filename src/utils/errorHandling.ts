import { LogService } from '../services/LogService.js';

/**
 * Error handling categories for catch blocks
 * Based on MAINTENANCE.md recommendations
 */

/**
 * CATEGORY 1: Optional UI operations
 * Silent failures are acceptable, but should be documented
 */
export function handleOptionalOperation<T>(
  operation: () => T,
  context?: string
): T | undefined {
  try {
    return operation();
  } catch {
    // Intentionally silent - operation is optional
    // Example: tmux refresh-client, UI updates
    return undefined;
  }
}

/**
 * CATEGORY 2: Non-critical with fallback
 * Log the error but continue with fallback value
 */
export function handleWithFallback<T>(
  operation: () => T,
  fallback: T,
  context: string
): T {
  try {
    return operation();
  } catch (error) {
    LogService.getInstance().debug(
      `${context} - using fallback`,
      'warn',
      error instanceof Error ? error.message : String(error)
    );
    return fallback;
  }
}

/**
 * CATEGORY 3: Critical path operation
 * Log and re-throw - caller must handle
 */
export function handleCriticalOperation<T>(
  operation: () => T,
  context: string
): T {
  try {
    return operation();
  } catch (error) {
    LogService.getInstance().debug(
      `Critical operation failed: ${context}`,
      'error',
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

/**
 * CATEGORY 4: Expected errors (like checking if something exists)
 * Log at debug level and return false/null
 */
export function handleExpectedError<T>(
  operation: () => T,
  context: string,
  defaultValue: T
): T {
  try {
    return operation();
  } catch (error) {
    LogService.getInstance().debug(
      context,
      'debug',
      error instanceof Error ? error.message : String(error)
    );
    return defaultValue;
  }
}

/**
 * Common pattern: Check if a command/resource exists
 * Returns true if exists, false otherwise
 */
export function checkExists(
  checkOperation: () => void,
  resourceName: string
): boolean {
  try {
    checkOperation();
    return true;
  } catch {
    LogService.getInstance().debug(
      `${resourceName} does not exist`,
      'debug'
    );
    return false;
  }
}

/**
 * Async versions of the above
 */

export async function handleOptionalOperationAsync<T>(
  operation: () => Promise<T>,
  context?: string
): Promise<T | undefined> {
  try {
    return await operation();
  } catch {
    // Intentionally silent - operation is optional
    return undefined;
  }
}

export async function handleWithFallbackAsync<T>(
  operation: () => Promise<T>,
  fallback: T,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    LogService.getInstance().debug(
      `${context} - using fallback`,
      'warn',
      error instanceof Error ? error.message : String(error)
    );
    return fallback;
  }
}

export async function handleCriticalOperationAsync<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    LogService.getInstance().debug(
      `Critical operation failed: ${context}`,
      'error',
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

export async function handleExpectedErrorAsync<T>(
  operation: () => Promise<T>,
  context: string,
  defaultValue: T
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    LogService.getInstance().debug(
      context,
      'debug',
      error instanceof Error ? error.message : String(error)
    );
    return defaultValue;
  }
}
