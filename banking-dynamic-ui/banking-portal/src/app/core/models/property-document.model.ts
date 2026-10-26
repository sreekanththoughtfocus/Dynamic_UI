export type PropertyKind = 'menu' | 'submenu' | 'item' | 'action';

export type ItemType = 'radio' | 'checkbox' | 'dropdown' | 'text' | 'toggle' | 'number';

export type PropertyValue = string | number | boolean;

export type PropertyValueMap = Record<string, PropertyValue>;

export interface PropertyOption {
  value: string;
  label: string;
}

export interface PropertyNode {
  id: string;
  kind: PropertyKind;
  label: string;
  itemType?: ItemType;
  options?: PropertyOption[];
  actionKey?: string;
  children?: PropertyNode[];
}

export interface PropertyDocument {
  id: string;
  name: string;
  tree: PropertyNode[];
  values: PropertyValueMap;
  updatedAt?: string;
}

export interface PropertyDocumentSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface PropertySaveResult {
  document: PropertyDocument | null;
  error: string | null;
}

export const ITEM_TYPES: readonly ItemType[] = [
  'radio',
  'checkbox',
  'dropdown',
  'text',
  'toggle',
  'number',
];

const KIND_LABELS: Record<PropertyKind, string> = {
  menu: 'Menu',
  submenu: 'Sub menu',
  item: 'Item',
  action: 'Action',
};

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  radio: 'Radio',
  checkbox: 'Checkbox',
  dropdown: 'Dropdown',
  text: 'Text',
  toggle: 'Toggle',
  number: 'Number',
};

export function kindLabel(kind: PropertyKind): string {
  return KIND_LABELS[kind];
}

export function itemTypeLabel(itemType: ItemType): string {
  return ITEM_TYPE_LABELS[itemType];
}

export function isPropertyKind(value: string): value is PropertyKind {
  return value === 'menu' || value === 'submenu' || value === 'item' || value === 'action';
}

export function isItemType(value: string): value is ItemType {
  return (
    value === 'radio' ||
    value === 'checkbox' ||
    value === 'dropdown' ||
    value === 'text' ||
    value === 'toggle' ||
    value === 'number'
  );
}
