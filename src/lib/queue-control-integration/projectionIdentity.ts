export function projectionIdentity(namespace: string, entityKey: string): string {
  const normalizedNamespace = namespace.trim();
  const normalizedEntityKey = entityKey.trim();
  if (!normalizedNamespace) throw new Error("SHEETS_PROJECTION_NAMESPACE_REQUIRED");
  if (!normalizedEntityKey) throw new Error("SHEETS_PROJECTION_ENTITY_KEY_REQUIRED");
  return JSON.stringify([normalizedNamespace, normalizedEntityKey]);
}
