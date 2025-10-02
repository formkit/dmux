/**
 * API Action Handler
 *
 * Adapts standardized ActionResults to HTTP responses.
 * Converts ActionResults into JSON that web UIs can consume.
 */

import type { ActionResult, ActionOption } from '../actions/types.js';

/**
 * Standardized API response for action results
 */
export interface APIActionResponse {
  success: boolean;
  type: ActionResult['type'];
  message: string;
  title?: string;

  // For interactions that need user response
  requiresInteraction?: boolean;
  interactionType?: 'confirm' | 'choice' | 'input';

  // Confirm dialog data
  confirmData?: {
    yesLabel: string;
    noLabel: string;
    callbackId: string;  // ID to use when user responds
  };

  // Choice dialog data
  choiceData?: {
    options: Array<{
      id: string;
      label: string;
      description?: string;
      danger?: boolean;
      default?: boolean;
    }>;
    callbackId: string;
  };

  // Input dialog data
  inputData?: {
    placeholder?: string;
    defaultValue?: string;
    callbackId: string;
  };

  // Progress data
  progressData?: {
    percent?: number;
    indeterminate: boolean;
  };

  // Navigation data
  navigationData?: {
    targetPaneId?: string;
  };

  // Additional metadata
  data?: any;
  dismissable?: boolean;
}

/**
 * Pending action callbacks stored in memory
 * In production, these should be stored in a session store or database
 */
const pendingCallbacks = new Map<string, {
  onConfirm?: () => Promise<ActionResult>;
  onCancel?: () => Promise<ActionResult>;
  onSelect?: (optionId: string) => Promise<ActionResult>;
  onSubmit?: (value: string) => Promise<ActionResult>;
  timestamp: number;
}>();

/**
 * Clean up old callbacks (older than 5 minutes)
 */
function cleanupOldCallbacks() {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [id, data] of pendingCallbacks.entries()) {
    if (data.timestamp < fiveMinutesAgo) {
      pendingCallbacks.delete(id);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupOldCallbacks, 60 * 1000);

/**
 * Convert ActionResult to API response
 */
export function actionResultToAPIResponse(result: ActionResult): APIActionResponse {
  const baseResponse: APIActionResponse = {
    success: result.type !== 'error',
    type: result.type,
    message: result.message,
    title: result.title,
    dismissable: result.dismissable,
    data: result.data,
  };

  switch (result.type) {
    case 'confirm': {
      const callbackId = generateCallbackId();
      pendingCallbacks.set(callbackId, {
        onConfirm: result.onConfirm,
        onCancel: result.onCancel,
        timestamp: Date.now(),
      });

      return {
        ...baseResponse,
        requiresInteraction: true,
        interactionType: 'confirm',
        confirmData: {
          yesLabel: result.confirmLabel || 'Yes',
          noLabel: result.cancelLabel || 'No',
          callbackId,
        },
      };
    }

    case 'choice': {
      const callbackId = generateCallbackId();
      pendingCallbacks.set(callbackId, {
        onSelect: result.onSelect,
        timestamp: Date.now(),
      });

      return {
        ...baseResponse,
        requiresInteraction: true,
        interactionType: 'choice',
        choiceData: {
          options: result.options || [],
          callbackId,
        },
      };
    }

    case 'input': {
      const callbackId = generateCallbackId();
      pendingCallbacks.set(callbackId, {
        onSubmit: result.onSubmit,
        timestamp: Date.now(),
      });

      return {
        ...baseResponse,
        requiresInteraction: true,
        interactionType: 'input',
        inputData: {
          placeholder: result.placeholder,
          defaultValue: result.defaultValue,
          callbackId,
        },
      };
    }

    case 'progress':
      return {
        ...baseResponse,
        progressData: {
          percent: result.progress,
          indeterminate: result.progress === undefined,
        },
      };

    case 'navigation':
      return {
        ...baseResponse,
        navigationData: {
          targetPaneId: result.targetPaneId,
        },
      };

    default:
      return baseResponse;
  }
}

/**
 * Handle user's response to a confirm dialog
 */
export async function handleConfirmResponse(
  callbackId: string,
  confirmed: boolean
): Promise<APIActionResponse> {
  const callback = pendingCallbacks.get(callbackId);

  if (!callback) {
    return {
      success: false,
      type: 'error',
      message: 'Callback expired or not found',
    };
  }

  pendingCallbacks.delete(callbackId);

  const handler = confirmed ? callback.onConfirm : callback.onCancel;
  if (!handler) {
    return {
      success: true,
      type: 'info',
      message: 'Action cancelled',
    };
  }

  const result = await handler();
  return actionResultToAPIResponse(result);
}

/**
 * Handle user's choice selection
 */
export async function handleChoiceResponse(
  callbackId: string,
  optionId: string
): Promise<APIActionResponse> {
  const callback = pendingCallbacks.get(callbackId);

  if (!callback || !callback.onSelect) {
    return {
      success: false,
      type: 'error',
      message: 'Callback expired or not found',
    };
  }

  pendingCallbacks.delete(callbackId);

  const result = await callback.onSelect(optionId);
  return actionResultToAPIResponse(result);
}

/**
 * Handle user's input submission
 */
export async function handleInputResponse(
  callbackId: string,
  value: string
): Promise<APIActionResponse> {
  const callback = pendingCallbacks.get(callbackId);

  if (!callback || !callback.onSubmit) {
    return {
      success: false,
      type: 'error',
      message: 'Callback expired or not found',
    };
  }

  pendingCallbacks.delete(callbackId);

  const result = await callback.onSubmit(value);
  return actionResultToAPIResponse(result);
}

/**
 * Generate unique callback ID
 */
function generateCallbackId(): string {
  return `callback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
