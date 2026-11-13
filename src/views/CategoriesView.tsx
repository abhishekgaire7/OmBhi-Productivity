import { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { Category, Task } from '../types';

interface CategoriesViewProps {
  categories: Category[];
  tasks: Task[];
  onAddCategory: (category: Category) => void;
  onUpdateCategory: (category: Category) => void;
  onDeleteCategory: (categoryId: string) => void;
}

const PRESET_COLORS = [
  '#2563EB', // Blue
  '#6657E8', // Indigo-Violet
  '#16A34A', // Emerald
  '#D97706', // Warm Amber
  '#DB2777', // Rose-Pink
  '#64748B', // Slate
  '#0891B2', // Cyan
  '#84CC16', // Lime
  '#9333EA', // Purple
  '#EA580C', // Orange
];

export function CategoriesView({
  categories,
  tasks,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
}: CategoriesViewProps) {
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6657E8');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    onAddCategory({
      id: 'cat-' + Date.now(),
      name: newCatName.trim(),
      color: newCatColor,
    });
    setNewCatName('');
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
  };

  const saveEdit = (id: string) => {
    if (!editName.trim()) return;
    onUpdateCategory({
      id,
      name: editName.trim(),
      color: editColor,
    });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header & Add Category */}
      <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
        <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          Category Spaces
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Organize your goals across Work, Study, Health, and Personal life.
        </p>

        {/* Create form */}
        <form onSubmit={handleCreate} className="mt-5 flex flex-wrap items-center gap-3">
          <input
            type="text"
            required
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="New category name..."
            className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-[#6657E8] focus:outline-hidden dark:border-slate-700 dark:bg-[#1E293B] dark:text-white"
          />

          {/* Color palette selector */}
          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewCatColor(c)}
                aria-label={`Select color ${c}`}
                className={`h-5 w-5 rounded-full transition-transform ${
                  newCatColor === c ? 'scale-125 ring-2 ring-gray-400 ring-offset-2' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB] transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Category</span>
          </button>
        </form>
      </div>

      {/* Categories Grid or Empty State */}
      {categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center dark:border-slate-800 dark:bg-[#1E293B]">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            No categories created yet.
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">
            Create spaces (such as Work, Study, Health, or Personal) using the form above to color-code and organize your tasks.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {categories.map((cat) => {
          const taskCount = tasks.filter((t) => t.categoryId === cat.id).length;
          const isEditing = editingId === cat.id;

          return (
            <div
              key={cat.id}
              className="flex items-center justify-between rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]"
            >
              {isEditing ? (
                <div className="flex w-full items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    autoFocus
                  />
                  <div className="flex items-center gap-1">
                    {PRESET_COLORS.slice(0, 5).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        className={`h-4 w-4 rounded-full ${editColor === c ? 'ring-1 ring-black' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => saveEdit(cat.id)}
                    aria-label={`Save ${cat.name}`}
                    className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel editing"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <div>
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white">
                        {cat.name}
                      </h4>
                      <p className="text-[11px] text-gray-400">
                        {taskCount} {taskCount === 1 ? 'task' : 'tasks'} assigned
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(cat)}
                      aria-label={`Edit category ${cat.name}`}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-gray-200"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteCategory(cat.id)}
                      aria-label={`Delete category ${cat.name}`}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}
