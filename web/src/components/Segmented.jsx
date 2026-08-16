/** iOS-style segmented control: recessed track with one raised pill per option. */
export default function Segmented({ label, options, value, onSelect }) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="w-16 shrink-0 whitespace-nowrap text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
      )}
      <div
        className="flex flex-1 rounded-full border border-zinc-300 bg-neutral-200/70 p-0.5 dark:border-zinc-700 dark:bg-neutral-800"
        role="group"
        aria-label={label}
      >
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => onSelect(option.id)}
            aria-pressed={value === option.id}
            className={`flex-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
              value === option.id
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-white"
                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
