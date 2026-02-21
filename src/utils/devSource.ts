import path from "path"

export interface DevSourceResolution {
  nextSourcePath: string
  toggledToRoot: boolean
}

export function isActiveDevSourcePath(
  paneWorktreePath?: string,
  activeSourcePath?: string
): boolean {
  if (!paneWorktreePath || !activeSourcePath) return false
  return path.resolve(paneWorktreePath) === path.resolve(activeSourcePath)
}

export function resolveNextDevSourcePath(
  paneWorktreePath: string,
  activeSourcePath: string,
  projectRoot: string
): DevSourceResolution {
  if (isActiveDevSourcePath(paneWorktreePath, activeSourcePath)) {
    return {
      nextSourcePath: projectRoot,
      toggledToRoot: true,
    }
  }

  return {
    nextSourcePath: paneWorktreePath,
    toggledToRoot: false,
  }
}
