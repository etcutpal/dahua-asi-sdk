import { cn } from '@/lib/utils';

interface BadgeProps {
  className?: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  children: React.ReactNode;
}

export function Badge({ className, variant = 'default', children }: BadgeProps) {
  const variantClasses = {
    default: 'bg-primary-100 text-primary-800',
    secondary: 'bg-gray-100 text-gray-800',
    destructive: 'bg-red-100 text-red-800',
    outline: 'border border-gray-200 text-gray-700',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
