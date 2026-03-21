import fs from 'fs';
import type { DmuxPane, MergeTargetReference } from '../types.js';
import { branchExists, getCurrentBranch, getPaneBranchName } from './git.js';
import { hasCommitsToMerge } from './mergeValidation.js';
import { deriveProjectRootFromWorktreePath } from './paneProject.js';
import { getPaneDisplayName } from './paneTitle.js';

export type MergeTargetFallbackReason = 'missing' | 'merged' | 'branch_changed';

export interface MergeTargetResolution {
  target: MergeTargetReference;
  targetRepoPath: string;
  targetBranch: string;
  targetLabel: string;
  requiresConfirmation: boolean;
  fallbackFrom?: MergeTargetReference;
  fallbackReason?: MergeTargetFallbackReason;
}

function cloneMergeTarget(target: MergeTargetReference): MergeTargetReference {
  return {
    displayName: target.displayName,
    branchName: target.branchName,
    slug: target.slug,
    worktreePath: target.worktreePath,
  };
}

export function formatMergeTargetLabel(target: MergeTargetReference): string {
  const label = target.displayName || target.slug || target.branchName;
  if (label !== target.branchName) {
    return `"${label}" (${target.branchName})`;
  }
  return `"${label}"`;
}

export function createMergeTargetChain(
  parentPane: DmuxPane,
  projectRoot: string
): MergeTargetReference[] {
  if (!parentPane.worktreePath) {
    return [];
  }

  const parentTarget: MergeTargetReference = {
    displayName: parentPane.displayName,
    slug: parentPane.slug,
    branchName: getPaneBranchName(parentPane),
    worktreePath: parentPane.worktreePath,
  };

  if (Array.isArray(parentPane.mergeTargetChain) && parentPane.mergeTargetChain.length > 0) {
    return [parentTarget, ...parentPane.mergeTargetChain.map(cloneMergeTarget)];
  }

  const mergeBaseRepoPath = deriveProjectRootFromWorktreePath(parentPane.worktreePath) || projectRoot;
  const mergeBaseBranch = getCurrentBranch(mergeBaseRepoPath);

  return [
    parentTarget,
    {
      slug: mergeBaseBranch,
      branchName: mergeBaseBranch,
      worktreePath: mergeBaseRepoPath,
    },
  ];
}

function getDefaultMergeTarget(pane: DmuxPane): MergeTargetResolution | null {
  const projectRoot = deriveProjectRootFromWorktreePath(pane.worktreePath) || pane.projectRoot;
  if (!projectRoot) {
    return null;
  }

  const targetBranch = getCurrentBranch(projectRoot);
  const target: MergeTargetReference = {
    slug: targetBranch,
    branchName: targetBranch,
    worktreePath: projectRoot,
  };

  return {
    target,
    targetRepoPath: projectRoot,
    targetBranch,
    targetLabel: formatMergeTargetLabel(target),
    requiresConfirmation: false,
  };
}

function getTargetUsability(target: MergeTargetReference): {
  ok: boolean;
  reason?: Exclude<MergeTargetFallbackReason, 'merged'>;
} {
  if (!target.worktreePath || !fs.existsSync(target.worktreePath)) {
    return { ok: false, reason: 'missing' };
  }

  const currentBranch = getCurrentBranch(target.worktreePath);
  if (currentBranch !== target.branchName) {
    return { ok: false, reason: 'branch_changed' };
  }

  return { ok: true };
}

function isTargetMergedIntoNextTarget(
  target: MergeTargetReference,
  nextTarget?: MergeTargetReference
): boolean {
  if (!nextTarget?.branchName || !target.worktreePath) {
    return false;
  }

  if (!branchExists(target.worktreePath, target.branchName)) {
    return false;
  }

  if (!branchExists(target.worktreePath, nextTarget.branchName)) {
    return false;
  }

  return !hasCommitsToMerge(
    target.worktreePath,
    target.branchName,
    nextTarget.branchName
  );
}

export function resolveMergeTarget(pane: DmuxPane): MergeTargetResolution | null {
  const mergeTargetChain = Array.isArray(pane.mergeTargetChain)
    ? pane.mergeTargetChain.filter((target) => !!target?.branchName)
    : [];

  if (mergeTargetChain.length === 0) {
    return getDefaultMergeTarget(pane);
  }

  let fallbackFrom: MergeTargetReference | undefined;
  let fallbackReason: MergeTargetFallbackReason | undefined;

  for (let index = 0; index < mergeTargetChain.length; index += 1) {
    const target = mergeTargetChain[index];
    const nextTarget = mergeTargetChain[index + 1];
    const usability = getTargetUsability(target);

    if (!usability.ok) {
      fallbackFrom ||= cloneMergeTarget(target);
      fallbackReason ||= usability.reason;
      continue;
    }

    if (nextTarget && isTargetMergedIntoNextTarget(target, nextTarget)) {
      fallbackFrom ||= cloneMergeTarget(target);
      fallbackReason ||= 'merged';
      continue;
    }

    return {
      target: cloneMergeTarget(target),
      targetRepoPath: target.worktreePath!,
      targetBranch: target.branchName,
      targetLabel: formatMergeTargetLabel(target),
      requiresConfirmation: Boolean(fallbackFrom),
      fallbackFrom,
      fallbackReason,
    };
  }

  return null;
}

export function buildFallbackMergeMessage(
  pane: DmuxPane,
  resolution: MergeTargetResolution,
  paneName: string = getPaneDisplayName(pane)
): string {
  const parentLabel = resolution.fallbackFrom
    ? formatMergeTargetLabel(resolution.fallbackFrom)
    : 'the original parent worktree';

  if (resolution.fallbackReason === 'merged') {
    return `${parentLabel} has already been merged upstream. Merge "${paneName}" directly into ${resolution.targetLabel} instead?`;
  }

  if (resolution.fallbackReason === 'branch_changed') {
    return `${parentLabel} is no longer checked out on its expected branch. Merge "${paneName}" directly into ${resolution.targetLabel} instead?`;
  }

  return `${parentLabel} is no longer available. Merge "${paneName}" directly into ${resolution.targetLabel} instead?`;
}

export function buildMissingMergeTargetMessage(pane: DmuxPane): string {
  return `Unable to find a valid merge target for "${getPaneDisplayName(pane)}". Reopen its parent worktree or check out the expected target branch before merging.`;
}
