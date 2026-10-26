import {
  ItemType,
  PropertyKind,
  PropertyNode,
  PropertyOption,
  PropertyValue,
  PropertyValueMap,
  isItemType,
  isPropertyKind,
} from './models/property-document.model';

export function readInput(event: Event): string {
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return target.value;
  }
  return '';
}

export function childKinds(parent: PropertyNode | null): PropertyKind[] {
  if (!parent) return ['menu'];
  switch (parent.kind) {
    case 'menu':
    case 'submenu':
      return ['item', 'action'];
    case 'item':
      return ['submenu'];
    default:
      return [];
  }
}

export function defaultValue(itemType: ItemType, options?: PropertyOption[]): PropertyValue {
  switch (itemType) {
    case 'checkbox':
    case 'toggle':
      return false;
    case 'number':
      return 0;
    case 'radio':
    case 'dropdown':
      return options?.[0]?.value ?? '';
    default:
      return '';
  }
}

export function choiceOptions(
  itemType: ItemType,
  options?: PropertyOption[],
): PropertyOption[] | undefined {
  if (itemType !== 'radio' && itemType !== 'dropdown') return undefined;
  if (options && options.length > 0) {
    return options.map((option) => ({ value: option.value, label: option.label }));
  }
  return [
    { value: 'option-1', label: 'Option 1' },
    { value: 'option-2', label: 'Option 2' },
  ];
}

export function createNode(kind: PropertyKind): PropertyNode {
  const id = createNodeId(kind);
  switch (kind) {
    case 'menu':
      return { id, kind, label: 'New menu', children: [] };
    case 'submenu':
      return { id, kind, label: 'New sub menu', children: [] };
    case 'action':
      return { id, kind, label: 'New action', actionKey: 'newAction' };
    default:
      return { id, kind: 'item', label: 'New setting', itemType: 'text', children: [] };
  }
}

export function withKind(node: PropertyNode, kind: PropertyKind): PropertyNode {
  if (node.kind === kind) return node;
  if (kind === 'action') {
    return {
      id: node.id,
      kind,
      label: node.label,
      actionKey: node.actionKey?.trim() || 'newAction',
    };
  }
  if (kind === 'menu' || kind === 'submenu') {
    return {
      id: node.id,
      kind,
      label: node.label,
      children: filterChildren(kind, node.children ?? []),
    };
  }
  const itemType = node.itemType ?? 'text';
  return {
    id: node.id,
    kind: 'item',
    label: node.label,
    itemType,
    options: choiceOptions(itemType, node.options),
    children: filterChildren('item', node.children ?? []),
  };
}

export function findNode(nodes: PropertyNode[], id: string): PropertyNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParentId(nodes: PropertyNode[], id: string): string | null {
  const walk = (list: PropertyNode[], parentId: string | null): string | null | undefined => {
    for (const node of list) {
      if (node.id === id) return parentId;
      if (node.children) {
        const found = walk(node.children, node.id);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  const found = walk(nodes, null);
  return found === undefined ? null : found;
}

export function parentKindOf(nodes: PropertyNode[], id: string): PropertyKind | 'root' | null {
  const walk = (list: PropertyNode[], parent: PropertyKind | 'root'): PropertyKind | 'root' | null => {
    for (const node of list) {
      if (node.id === id) return parent;
      if (node.children) {
        const found = walk(node.children, node.kind);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(nodes, 'root');
}

export function insertNode(
  nodes: PropertyNode[],
  parentId: string | null,
  child: PropertyNode,
): PropertyNode[] {
  if (parentId == null) return [...nodes, child];
  return nodes.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: [...(node.children ?? []), child] };
    }
    if (!node.children) return node;
    return { ...node, children: insertNode(node.children, parentId, child) };
  });
}

export function replaceNode(nodes: PropertyNode[], id: string, replacement: PropertyNode): PropertyNode[] {
  return nodes.map((node) => {
    if (node.id === id) return replacement;
    if (!node.children) return node;
    return { ...node, children: replaceNode(node.children, id, replacement) };
  });
}

export function removeNode(nodes: PropertyNode[], id: string): PropertyNode[] {
  const next: PropertyNode[] = [];
  for (const node of nodes) {
    if (node.id === id) continue;
    next.push({
      ...node,
      children: node.children ? removeNode(node.children, id) : undefined,
    });
  }
  return next;
}

export function pruneValues(values: PropertyValueMap, nodes: PropertyNode[]): PropertyValueMap {
  const keep = new Set(collectItemIds(nodes));
  const next: PropertyValueMap = {};
  for (const key of Object.keys(values)) {
    const value = values[key];
    if (keep.has(key) && value !== undefined) next[key] = value;
  }
  return next;
}

export function coerceValues(nodes: PropertyNode[], values: PropertyValueMap): PropertyValueMap {
  const next: PropertyValueMap = {};
  const walk = (list: PropertyNode[]) => {
    for (const node of list) {
      if (node.kind === 'item') {
        next[node.id] = coerceValue(node.itemType ?? 'text', values[node.id], node.options);
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return next;
}

export function validateTree(nodes: PropertyNode[], parent: PropertyKind | null = null): string | null {
  for (const node of nodes) {
    if (!node.label.trim()) return 'Every node needs a label.';
    const allowed = childKinds(parent == null ? null : { id: 'parent', kind: parent, label: 'parent' });
    if (!allowed.includes(node.kind)) {
      return `"${node.label}" cannot sit in this part of the tree.`;
    }
    if (node.kind === 'item') {
      if (!node.itemType || !isItemType(node.itemType)) {
        return `"${node.label}" needs a control type.`;
      }
      if (node.itemType === 'radio' || node.itemType === 'dropdown') {
        const options = node.options ?? [];
        if (options.length === 0) return `"${node.label}" needs at least one choice.`;
        const seen = new Set<string>();
        for (const option of options) {
          const value = option.value.trim();
          if (!value || !option.label.trim()) {
            return `Each choice on "${node.label}" needs a value and a label.`;
          }
          if (seen.has(value)) {
            return `"${node.label}" has two choices with the value "${value}".`;
          }
          seen.add(value);
        }
      }
    }
    if (node.kind === 'action') {
      const actionKey = node.actionKey?.trim() ?? '';
      if (!actionKey || /\s/.test(actionKey)) {
        return `"${node.label}" needs an action key without spaces.`;
      }
    }
    const childError = validateTree(node.children ?? [], node.kind);
    if (childError) return childError;
  }
  return null;
}

export function displayedValue(node: PropertyNode, values: PropertyValueMap): PropertyValue {
  const itemType = node.itemType ?? 'text';
  return coerceValue(itemType, values[node.id], node.options);
}

export type MenuSelectionJson = {
  [name: string]: PropertyValue | MenuSelectionJson;
};

export function selectedMenuValues(nodes: PropertyNode[], values: PropertyValueMap): MenuSelectionJson {
  const result: MenuSelectionJson = {};
  for (const node of nodes) {
    if (node.kind === 'action') continue;
    const key = selectionKey(result, node.label.trim() || node.id, node.id);
    if (node.kind === 'item') {
      const selected = displayedValue(node, values);
      const nested = selectedMenuValues(node.children ?? [], values);
      if (Object.keys(nested).length > 0) {
        result[key] = { selected, ...nested };
      } else {
        result[key] = selected;
      }
      continue;
    }
    result[key] = selectedMenuValues(node.children ?? [], values);
  }
  return result;
}

function selectionKey(result: MenuSelectionJson, label: string, id: string): string {
  if (!(label in result)) return label;
  return `${label} (${id})`;
}

function filterChildren(kind: PropertyKind, children: PropertyNode[]): PropertyNode[] {
  const allowed = new Set(childKinds({ id: 'parent', kind, label: 'parent' }));
  return children.filter((child) => allowed.has(child.kind));
}

function collectItemIds(nodes: PropertyNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: PropertyNode[]) => {
    for (const node of list) {
      if (node.kind === 'item') ids.push(node.id);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return ids;
}

function coerceValue(
  itemType: ItemType,
  current: PropertyValue | undefined,
  options?: PropertyOption[],
): PropertyValue {
  if (itemType === 'checkbox' || itemType === 'toggle') return current === true;
  if (itemType === 'number') {
    if (typeof current === 'number' && Number.isFinite(current)) return current;
    const parsed = typeof current === 'string' ? Number(current) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const text = typeof current === 'string' ? current : '';
  if ((itemType === 'radio' || itemType === 'dropdown') && options?.length) {
    if (options.some((option) => option.value === text)) return text;
    return options[0]?.value ?? '';
  }
  return text;
}

function createNodeId(kind: PropertyKind): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 8);
  const suffix = random && random.length > 0 ? random : Math.random().toString(16).slice(2, 10);
  return `${kind}-${suffix}`;
}

export function parseKind(value: string): PropertyKind | null {
  return isPropertyKind(value) ? value : null;
}
