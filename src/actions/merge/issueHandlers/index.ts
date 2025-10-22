/**
 * Issue Handlers - Barrel export
 */

export { handleNothingToMerge } from './nothingToMergeHandler.js';
export { handleMainDirty } from './mainDirtyHandler.js';
export type { MainDirtyIssue } from './mainDirtyHandler.js';
export { handleWorktreeUncommitted } from './worktreeUncommittedHandler.js';
export type { WorktreeUncommittedIssue } from './worktreeUncommittedHandler.js';
export { handleMergeConflict } from './mergeConflictHandler.js';
export type { MergeConflictIssue } from './mergeConflictHandler.js';
