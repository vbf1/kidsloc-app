export function getWorkspaceCompanyName(company: unknown): string | null {
  const relation = Array.isArray(company) ? company[0] : company;

  if (
    typeof relation !== 'object' ||
    relation === null ||
    !('name' in relation) ||
    typeof relation.name !== 'string'
  ) {
    return null;
  }

  const name = relation.name.trim();
  return name.length > 0 ? name : null;
}
