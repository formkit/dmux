export type ProjectActivityRoot = string | null | undefined;

export type TrackProjectActivity = <T>(
  work: () => Promise<T> | T,
  projectRoot?: ProjectActivityRoot
) => Promise<T>;

export type BeginProjectActivity = (
  projectRoot?: ProjectActivityRoot
) => () => void;
