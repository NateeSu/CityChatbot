import type { IndexChunk, IndexFact } from "./indexer";
import { normalizeRetrievalText, retrievalEntityScopeKey, type RetrievalEntityOption } from "./retriever";

const SOURCE_EXTENSION = /\.(?:docx?|pdf|txt|xlsx?|pptx?)$/iu;

const sourceTitle = (value: string): string => value.trim().replace(SOURCE_EXTENSION, "").trim();

const uniqueAliases = (values: readonly string[], label: string): string[] => {
  const normalizedLabel = normalizeRetrievalText(label);
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const value of values) {
    const alias = value.trim();
    const normalized = normalizeRetrievalText(alias);
    if (normalized.length < 2 || normalized === normalizedLabel || seen.has(normalized)) continue;
    seen.add(normalized);
    aliases.push(alias);
  }
  return aliases.sort((left, right) => left.localeCompare(right));
};

const declaredAliases = (fact: IndexFact): string[] => {
  const aliases = fact.valueJson.entityAliases;
  return Array.isArray(aliases) && aliases.every((alias) => typeof alias === "string") ? [...aliases] : [];
};

export const retrievalEntitiesFromFacts = (facts: readonly IndexFact[]): RetrievalEntityOption[] => {
  const grouped = new Map<string, { type: string; key: string; label: string; aliases: string[] }>();
  for (const fact of facts) {
    const key = retrievalEntityScopeKey(fact.entityKey);
    const groupKey = `${fact.entityType}:${key}`;
    const existing = grouped.get(groupKey) ?? {
      type: fact.entityType,
      key,
      label: fact.entityDisplayName,
      aliases: [],
    };
    const parenthetical = [...fact.entityDisplayName.matchAll(/\(([^)]+)\)/gu)].map((match) => match[1]!);
    const locatorTitles = fact.sourceLocator.sectionPath.slice(0, 1).map(sourceTitle);
    const keyAlias = key.replace(/[-_]+/gu, " ");
    existing.aliases.push(...parenthetical, ...locatorTitles, keyAlias, ...declaredAliases(fact));
    grouped.set(groupKey, existing);
  }
  return [...grouped.values()]
    .map((entity) => ({ ...entity, aliases: uniqueAliases(entity.aliases, entity.label) }))
    .sort((left, right) => `${left.type}:${left.key}`.localeCompare(`${right.type}:${right.key}`));
};

export const documentTitlesFromChunks = (chunks: readonly IndexChunk[]): Record<string, string> => {
  const titles: Record<string, string> = {};
  for (const chunk of chunks) {
    const locatorTitle = chunk.sourceLocator.sectionPath[0];
    if (locatorTitle && !titles[chunk.documentVersionId]) titles[chunk.documentVersionId] = sourceTitle(locatorTitle);
  }
  return titles;
};
