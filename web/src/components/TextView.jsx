export default function TextView({ content }) {
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">
      {content}
    </pre>
  );
}
