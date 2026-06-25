'use client';

const DOT_COLORS = [
  'bg-green-600',
  'bg-blue-600',
  'bg-red-500',
  'bg-yellow-500',
  'bg-sky-400',
];

export function LoadingDots({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex items-end gap-3">
        {DOT_COLORS.map((color, i) => (
          <span
            key={i}
            className={`block h-4 w-4 rounded-full ${color} animate-bounce`}
            style={{ animationDelay: `${i * 120}ms`, animationDuration: '0.8s' }}
          />
        ))}
      </div>
      {text && (
        <p className="text-sm text-muted-foreground animate-pulse">{text}</p>
      )}
    </div>
  );
}
