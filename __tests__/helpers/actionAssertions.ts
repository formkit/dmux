/**
 * Custom assertion helpers for ActionResult testing
 */

import { expect } from 'vitest';
import type { ActionResult, ActionResultType } from '../../src/actions/types.js';

/**
 * Assert that an ActionResult has the expected type
 */
export function expectResultType(result: ActionResult, type: ActionResultType) {
  expect(result.type).toBe(type);
}

/**
 * Assert that an ActionResult is a success with optional message check
 */
export function expectSuccess(result: ActionResult, messageIncludes?: string) {
  expectResultType(result, 'success');
  if (messageIncludes) {
    expect(result.message).toContain(messageIncludes);
  }
}

/**
 * Assert that an ActionResult is an error with optional message check
 */
export function expectError(result: ActionResult, messageIncludes?: string) {
  expectResultType(result, 'error');
  if (messageIncludes) {
    expect(result.message).toContain(messageIncludes);
  }
}

/**
 * Assert that an ActionResult is a confirmation dialog
 */
export function expectConfirm(result: ActionResult) {
  expectResultType(result, 'confirm');
  expect(result.onConfirm).toBeDefined();
  expect(result.onCancel).toBeDefined();
}

/**
 * Assert that an ActionResult is a choice dialog with options
 */
export function expectChoice(result: ActionResult, minOptions: number = 1) {
  expectResultType(result, 'choice');
  expect(result.options).toBeDefined();
  expect(result.options!.length).toBeGreaterThanOrEqual(minOptions);
  expect(result.onSelect).toBeDefined();
}

/**
 * Assert that an ActionResult is an input dialog
 */
export function expectInput(result: ActionResult) {
  expectResultType(result, 'input');
  expect(result.onSubmit).toBeDefined();
}

/**
 * Assert that an ActionResult is navigation to a specific pane
 */
export function expectNavigation(result: ActionResult, targetPaneId?: string) {
  expectResultType(result, 'navigation');
  if (targetPaneId) {
    expect(result.targetPaneId).toBe(targetPaneId);
  } else {
    expect(result.targetPaneId).toBeDefined();
  }
}

/**
 * Assert that an ActionResult is an info message
 */
export function expectInfo(result: ActionResult, messageIncludes?: string) {
  expectResultType(result, 'info');
  if (messageIncludes) {
    expect(result.message).toContain(messageIncludes);
  }
}
