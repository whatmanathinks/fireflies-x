"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-white hover:bg-brand-700",
        secondary: "bg-white text-ink-800 border border-line hover:bg-ink-50",
        ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
        subtle: "bg-ink-100 text-ink-700 hover:bg-ink-200",
        danger: "bg-white text-red-600 border border-line hover:bg-red-50",
        link: "text-brand-600 hover:underline",
      },
      size: {
        sm: "h-7 px-2.5 text-[12px] [&_svg]:size-3.5",
        md: "h-8.5 px-3 text-[13px] [&_svg]:size-4",
        lg: "h-10 px-4 text-sm [&_svg]:size-4",
        icon: "h-8 w-8 [&_svg]:size-4",
        iconSm: "h-7 w-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}

export { buttonVariants };
