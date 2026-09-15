"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check, Minus } from "lucide-react";
import * as React from "react";
import { avatarColor, cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  image,
  size = 24,
  className,
}: {
  name: string;
  image?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.max(9, size * 0.38) };
  if (image) {
    return (
      <img
        src={image}
        alt={name}
        style={style}
        className={cn("shrink-0 rounded-full object-cover ring-2 ring-white", className)}
      />
    );
  }
  return (
    <span
      style={style}
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white",
        avatarColor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  names,
  max = 4,
  size = 24,
}: {
  names: string[];
  max?: number;
  size?: number;
}) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((n) => (
        <Avatar key={n} name={n} size={size} />
      ))}
      {rest > 0 && (
        <span
          style={{ width: size, height: size, fontSize: Math.max(9, size * 0.34) }}
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-ink-200 font-semibold text-ink-600 ring-2 ring-white"
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & {
  tone?: "neutral" | "brand" | "green" | "amber" | "red" | "outline";
}) {
  const tones = {
    neutral: "bg-ink-100 text-ink-600",
    brand: "bg-brand-50 text-brand-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    outline: "border border-line text-ink-600",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium [&_svg]:size-3",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-8.5 w-full rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full resize-none rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] leading-relaxed text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100",
        className,
      )}
      {...props}
    />
  );
}

export function Checkbox({
  className,
  indeterminate,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & { indeterminate?: boolean }) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-ink-300 bg-white outline-none transition-colors hover:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-200 data-[state=checked]:border-brand-600 data-[state=checked]:bg-brand-600",
        indeterminate && "border-brand-600 bg-brand-600",
        className,
      )}
      {...props}
    >
      {indeterminate ? (
        <Minus className="size-3 text-white" strokeWidth={3} />
      ) : (
        <CheckboxPrimitive.Indicator>
          <Check className="size-3 text-white" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      )}
    </CheckboxPrimitive.Root>
  );
}

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full bg-ink-200 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-200 data-[state=checked]:bg-brand-600",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4.5" />
    </SwitchPrimitive.Root>
  );
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-card border border-line bg-white", className)}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-ink-100", className)} {...props} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-ink-100 text-ink-400">
        <Icon className="size-5" />
      </div>
      <p className="text-[14px] font-semibold text-ink-800">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "text-[11px] font-semibold uppercase tracking-wider text-ink-400",
        className,
      )}
      {...props}
    />
  );
}
