import type { MutableMockAutomationRepository } from "@/lib/repositories/types";
import { createMockAutomationRepository } from "@/lib/repositories/mockAutomationRepository";
import { createAutomationRepositoryFromEnv } from "@/lib/repositories/repositoryFactory";

let repository: MutableMockAutomationRepository | null = null;

export function getAutomationRepository() {
  repository ??= createAutomationRepositoryFromEnv();
  return repository;
}

export function resetMockRepositoryForTests() {
  repository = createMockAutomationRepository();
  return repository;
}
