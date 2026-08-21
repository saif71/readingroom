import { timeAgo } from "../format";
import skillsIcon from "../icons/skills.svg";

export default function SkillsWidget({ skills, onOpen }) {
  if (skills.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40"
      aria-labelledby="skills-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="skills-heading"
            className="font-medium text-neutral-900 dark:text-neutral-100"
          >
            Skills
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Reusable agent skills from .claude/skills, .agents/skills and
            .cursor/skills
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {skills.length}
        </span>
      </div>
      <ol className="mt-4 space-y-0.5">
        {skills.map((skill) => (
          <li key={skill.path}>
            <button
              type="button"
              onClick={() => onOpen(skill.path)}
              title={skill.path}
              aria-label={`Open skill ${skill.name} (${skill.path})`}
              className="group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 dark:hover:bg-neutral-800/70"
            >
              {/* <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                {skill.sourceDir}
              </span> */}
              <img src={skillsIcon} alt={skill.sourceDir} className="w-4 h-4" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-800 group-hover:text-sky-700 dark:text-neutral-200 dark:group-hover:text-sky-300">
                  {skill.name}
                </span>
                <span className="block truncate text-xs text-neutral-400">
                  {skill.description || skill.path}
                </span>
              </span>
              <span
                className="shrink-0 text-right text-xs text-neutral-400"
                title={skill.updatedAt || undefined}
              >
                {timeAgo(skill.updatedAt) || ""}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
