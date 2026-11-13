import { Category } from '../types';

export const DEFAULT_REMINDER_CATEGORIES: Category[] = [
  { id: 'rem-cat-personal', name: 'Personal', color: '#6657E8', isDefault: true },
  { id: 'rem-cat-work', name: 'Work', color: '#2563EB', isDefault: true },
  { id: 'rem-cat-study', name: 'Study', color: '#8B5CF6', isDefault: true },
  { id: 'rem-cat-appointments', name: 'Appointments', color: '#0891B2', isDefault: true },
  { id: 'rem-cat-bills', name: 'Bills & Payments', color: '#D97706', isDefault: true },
  { id: 'rem-cat-health', name: 'Health & Fitness', color: '#16A34A', isDefault: true },
  { id: 'rem-cat-events', name: 'Important Events', color: '#EC4899', isDefault: true },
];

/**
 * Merges the 7 default reminder categories with any custom user categories.
 * Ensures default categories are always available for reminders even if custom categories are empty.
 */
export function getAvailableReminderCategories(userCategories: Category[]): Category[] {
  const merged = [...DEFAULT_REMINDER_CATEGORIES];
  for (const cat of userCategories) {
    if (!merged.some((m) => m.id === cat.id || m.name.toLowerCase() === cat.name.toLowerCase())) {
      merged.push(cat);
    }
  }
  return merged;
}

export function getCategoryById(catOrId: Category[] | string, idOrCat?: string | Category[]): Category {
  let categories: Category[] = [];
  let categoryId = '';
  if (Array.isArray(catOrId)) {
    categories = catOrId;
    categoryId = typeof idOrCat === 'string' ? idOrCat : '';
  } else {
    categoryId = catOrId;
    categories = Array.isArray(idOrCat) ? idOrCat : [];
  }
  const found = categories.find((c) => c.id === categoryId);
  if (found) return found;
  const def = DEFAULT_REMINDER_CATEGORIES.find((c) => c.id === categoryId);
  if (def) return def;
  return {
    id: categoryId,
    name: 'General',
    color: '#6657E8',
  };
}
