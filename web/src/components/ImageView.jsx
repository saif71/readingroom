import { useState } from 'react';
import { rawUrl } from '../api';

export default function ImageView({ path, refreshKey }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <p className="py-16 text-center text-sm text-neutral-400">Could not load image.</p>;
  }
  return (
    <div className="flex justify-center rounded-lg bg-neutral-100 p-4 dark:bg-neutral-900">
      <img
        key={`${path}:${refreshKey}`}
        src={rawUrl(path)}
        alt={path.split('/').pop()}
        onError={() => setFailed(true)}
        className="max-w-full rounded-md"
      />
    </div>
  );
}
