import { useState } from 'react';

export default function ImageView({ src, alt, reloadKey = 0 }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <p className="py-16 text-center text-sm text-neutral-400">Could not load image.</p>;
  }
  return (
    <div className="flex justify-center rounded-lg bg-neutral-100 p-4 dark:bg-neutral-900">
      <img
        key={`${src}:${reloadKey}`}
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        className="max-w-full rounded-md"
      />
    </div>
  );
}
