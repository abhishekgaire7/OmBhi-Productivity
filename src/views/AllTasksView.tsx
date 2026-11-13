import { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  LayoutList,
  Table as TableIcon,
  Check,
  XCircle,
  Edit2,
  Trash2,
  Clock,
} from 'lucide-react';
import { Category, Priority, Task, TaskStatus, UserSettings } from '../types';
import { matchesTaskFilters } from '../utils/calculations';
import { formatReadableDate, formatTimeDisplay } from '../utils/date';
import { TaskCard } from '../components/TaskCard';

interface AllTasksViewProps {
  tasks: Task[];
  categories: Category[];
  settings: UserSettings;
  onOpenNewTask: () => void;
  onEditTask: (task: Task) => void;
  onCompleteTask: (task: Task) => void;
  onFailSkipClick: (task: Task) => void;
  onUpdateProgress: (task: Task, progress: number) => void;
  onDeleteTask: (task: Task) => void;
  onDuplicateTask: (task: Task) => void;
  onRescheduleTask?: (task: Task) => void;
}

export function AllTasksView({
  tasks,
  categories,
  settings,
  onOpenNewTask,
  onEditTask,
  onCompleteTask,
  onFailSkipClick,
  onUpdateProgress,
  onDeleteTask,
  onDuplicateTask,
  onRescheduleTask,
}: AllTasksViewProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'none' | 'category' | 'priority' | 'status' | 'date'>('none');
  const [viewMode, setViewMode] = useState<'list' | 'table'>('list');

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) =>
      matchesTaskFilters(t, search, categoryFilter, priorityFilter, statusFilter)
    );
  }, [tasks, search, categoryFilter, priorityFilter, statusFilter]);

  // Grouped tasks calculation
  const groupedTasks = useMemo(() => {
    if (groupBy === 'none') return null;

    const groups: Record<string, Task[]> = {};
    filteredTasks.forEach((t) => {
      let key = 'Other';
      if (groupBy === 'category') {
        const cat = categories.find((c) => c.id === t.categoryId);
        key = cat ? cat.name : 'Uncategorized';
      } else if (groupBy === 'priority') {
        key = t.priority.toUpperCase();
      } else if (groupBy === 'status') {
        key = t.status.replace('_', ' ').toUpperCase();
      } else if (groupBy === 'date') {
        key = formatReadableDate(t.scheduledDate);
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [filteredTasks, groupBy, categories]);

  return (
    <div className="space-y-6">
      {/* Search and Filters Header */}
      <div className="space-y-4 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          {/* Search Field */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute top-2.5 left-3.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks, descriptions..."
              aria-label="Search tasks"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pr-3.5 pl-9 text-xs text-gray-900 placeholder:text-gray-400 focus:border-[#6657E8] focus:outline-hidden dark:border-slate-700 dark:bg-[#1E293B] dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* View Mode Toggle */}
            <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-label="List view"
                className={`rounded-lg p-1.5 transition ${
                  viewMode === 'list'
                    ? 'bg-white text-[#6657E8] shadow-xs dark:bg-[#1E293B] dark:text-[#A59DF7]'
                    : 'text-gray-500'
                }`}
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                aria-label="Table view"
                className={`rounded-lg p-1.5 transition ${
                  viewMode === 'table'
                    ? 'bg-white text-[#6657E8] shadow-xs dark:bg-[#1E293B] dark:text-[#A59DF7]'
                    : 'text-gray-500'
                }`}
              >
                <TableIcon className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenNewTask}
              className="flex items-center gap-1.5 rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB] transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Task</span>
            </button>
          </div>
        </div>

        {/* Filters and Grouping Row */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-xs dark:border-slate-800">
          <span className="text-gray-400 font-medium">Filters:</span>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-[#1E293B]"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-[#1E293B]"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter by priority"
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-[#1E293B]"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <span className="ml-auto text-gray-400 font-medium">Group by:</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
            aria-label="Group tasks by field"
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-[#1E293B]"
          >
            <option value="none">None</option>
            <option value="category">Category</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
            <option value="date">Scheduled Date</option>
          </select>
        </div>
      </div>

      {/* Empty State */}
      {filteredTasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-[#1E293B]">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            No tasks match your search or filter criteria.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Try resetting filters or adding a new task.
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div className="space-y-4">
          {!groupedTasks ? (
            <div className="space-y-2.5">
              {filteredTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  category={categories.find((c) => c.id === task.categoryId)}
                  timeFormat24h={settings.timeFormat24h}
                  onEdit={onEditTask}
                  onComplete={onCompleteTask}
                  onFailSkipClick={onFailSkipClick}
                  onUpdateProgress={onUpdateProgress}
                  onDelete={onDeleteTask}
                  onDuplicate={onDuplicateTask}
                />
              ))}
            </div>
          ) : (
            Object.entries(groupedTasks).map(([groupTitle, groupTasks]) => (
              <div key={groupTitle} className="space-y-2">
                <h4 className="pl-1 text-xs font-bold tracking-wider text-gray-400 uppercase">
                  {groupTitle} ({groupTasks.length})
                </h4>
                <div className="space-y-2.5">
                  {groupTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      category={categories.find((c) => c.id === task.categoryId)}
                      timeFormat24h={settings.timeFormat24h}
                      onEdit={onEditTask}
                      onComplete={onCompleteTask}
                      onFailSkipClick={onFailSkipClick}
                      onUpdateProgress={onUpdateProgress}
                      onDelete={onDeleteTask}
                      onDuplicate={onDuplicateTask}
                      onReschedule={onRescheduleTask}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* TABLE VIEW (High-density tabular mode) */
        <div className="overflow-x-auto rounded-2xl border border-gray-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-bold text-gray-400 uppercase tracking-wider dark:border-slate-800 dark:bg-slate-800/60">
                <th className="py-3 pl-4 pr-2 w-8"></th>
                <th className="py-3 px-3">Title</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Date & Time</th>
                <th className="py-3 px-3">Priority</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Progress</th>
                <th className="py-3 pr-4 pl-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {filteredTasks.map((task) => {
                const cat = categories.find((c) => c.id === task.categoryId);
                const isCompleted = task.status === 'completed';

                return (
                  <tr
                    key={task.id}
                    className="hover:bg-gray-50/50 transition dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2.5 pl-4 pr-2">
                      <button
                        type="button"
                        onClick={() => onCompleteTask(task)}
                        aria-label={`Mark "${task.title}" complete`}
                        className={`flex h-4.5 w-4.5 items-center justify-center rounded border transition ${
                          isCompleted
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-gray-300 text-transparent hover:border-emerald-500'
                        }`}
                      >
                        <Check className="h-3 w-3 stroke-[3]" />
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => onEditTask(task)}
                        className={`text-left font-semibold hover:text-[#6657E8] transition ${
                          isCompleted ? 'text-gray-400 line-through dark:text-gray-500' : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      {cat && (
                        <span
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor: `${cat.color}15`,
                            color: cat.color,
                          }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                          {cat.name}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-gray-500">
                      {formatReadableDate(task.scheduledDate)}
                      {task.startTime && ` · ${formatTimeDisplay(task.startTime, settings.timeFormat24h)}`}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          task.priority === 'urgent'
                            ? 'bg-rose-100 text-rose-700'
                            : task.priority === 'high'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400'
                        }`}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-gray-600 dark:text-gray-300">
                      {task.status.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                      {task.progress}%
                    </td>
                    <td className="py-2.5 pr-4 pl-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onFailSkipClick(task)}
                          aria-label={`Mark "${task.title}" failed or skipped`}
                          className="rounded p-1 text-gray-400 hover:text-rose-500"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditTask(task)}
                          aria-label={`Edit task "${task.title}"`}
                          className="rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTask(task)}
                          aria-label={`Delete task "${task.title}"`}
                          className="rounded p-1 text-gray-400 hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
