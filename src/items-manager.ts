import FuzzySearch from "fuzzy-search";
import {
  CompletionItem,
  CompletionItemKind,
  ExtensionContext,
  SnippetString,
} from "vscode";
import allCssProps from "./css-props.json";

import { COMMANDS, COLON, SEMICOLON, CURSOR, DEBUG } from "./constants";
import { getStore, toAlphabetic, getColonData, longEnough } from "./utils";
import { AbbrIndex } from "./abbr-index";
import { UsageMap, Comporator, ItemBuilder, Item, ItemKind } from "./types";

const priorityMap = allCssProps.reduce((acc, prop, index) => {
  acc[prop] = index;
  return acc;
}, {} as Record<string, number>);
const searcher = new FuzzySearch(allCssProps, []);
const abbrIndex = new AbbrIndex(allCssProps);

export const getTemplate = (property: string, lineText: string): string => {
  const lineData = getColonData(lineText);
  let template = property;

  if (!lineData.colon) {
    template += `${COLON} ${CURSOR}`;
  }

  if (!lineData.semicolon) {
    template += SEMICOLON;
  }

  return template;
};

export const getComporator =
  (usageMap: UsageMap): Comporator =>
  (a, b) => {
    const valA = usageMap[a.value] ?? -priorityMap[a.value] ?? 0;
    const valB = usageMap[b.value] ?? -priorityMap[b.value] ?? 0;

    return valB - valA;
  };

export const getItemBuilder =
  (usageMap: UsageMap, lineText: string): ItemBuilder =>
  (property, index) => {
    const item = new CompletionItem(property.value, CompletionItemKind.Field);
    const usageCount = usageMap[property.value] ?? 0;

    item.command = {
      title: COMMANDS.SELECTED.TITLE,
      command: COMMANDS.SELECTED.CMD,
      arguments: [property.value],
    };

    item.detail = "";

    if (usageCount || DEBUG) {
      item.detail += `Used ${usageCount} times`;
      if (DEBUG) {
        item.detail += ` [Source: ${property.kind}]`;
        item.detail += ` [Priority: ${-priorityMap[property.value]}]`;
      }
    }

    item.filterText = property.value;
    item.sortText = toAlphabetic(index + 1);
    item.insertText = new SnippetString(getTemplate(property.value, lineText));

    return item;
  };

export const getItems = (
  context: ExtensionContext,
  prefix: string,
  lineText: string
): CompletionItem[] => {
  const prefixData = getColonData(prefix);

  if (prefixData.colon || prefixData.semicolon || !prefix.length) return [];

  const usageMap = getStore(context);
  const result: Item[] = [];
  const addedMap = new Map<string, 1>();

  if (prefix.length >= 1) {
    for (const value of allCssProps) {
      if (value.startsWith(prefix) && longEnough(value)) {
        result.push({ value, kind: ItemKind.PREFIX });
        addedMap.set(value, 1);
      }
    }

    if (prefix.length >= 2) {
      const abbrItems = abbrIndex.getItem(prefix.split(""));

      for (const value of abbrItems) {
        if (addedMap.has(value)) continue;

        result.push({ value, kind: ItemKind.ABBR });
        addedMap.set(value, 1);
      }
    }
  }

  if (prefix.length > 2 && result.length < 5) {
    const fuzzyItems = searcher.search(prefix);

    for (const value of fuzzyItems) {
      if (longEnough(value) && !addedMap.has(value)) {
        result.push({ value, kind: ItemKind.FUZZY });
        addedMap.set(value, 1);
      }
    }
  }

  return result
    .sort(getComporator(usageMap))
    .map(getItemBuilder(usageMap, lineText));
};
