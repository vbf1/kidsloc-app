export type WorkspaceSessionCache = {
  userId: string;
  email: string;
  companyName: string;
  companyId: string;
  role: 'admin' | 'staff' | 'platform_owner';
};

let cachedWorkspace: WorkspaceSessionCache | null = null;

/** Keeps the verified workspace available during client-side route transitions. */
export function getWorkspaceSessionCache(): WorkspaceSessionCache | null {
  return cachedWorkspace;
}

export function setWorkspaceSessionCache(workspace: WorkspaceSessionCache): void {
  cachedWorkspace = workspace;
}

export function clearWorkspaceSessionCache(): void {
  cachedWorkspace = null;
}
