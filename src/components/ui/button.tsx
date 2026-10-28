import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding t-14 salt font-medium whitespace-nowrap outline-none select-none transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-(--ease-out) focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        /** White control with the hairline border used across the design */
        control:
          "border-control bg-surface text-fg hover-fine:bg-hover aria-expanded:bg-hover data-[state=open]:bg-hover",
        /** Purple gradient call-to-action ("Request time-off") */
        brand: "accent-surface hover-fine:brightness-[1.06]",
        default: "bg-primary text-primary-foreground hover-fine:bg-brand-strong",
        outline:
          "border-control bg-surface text-fg hover-fine:bg-hover aria-expanded:bg-hover",
        secondary: "bg-app text-fg hover-fine:bg-hover",
        ghost: "text-fg-2 hover-fine:bg-hover hover-fine:text-fg aria-expanded:bg-hover aria-expanded:text-fg",
        destructive:
          "bg-[var(--status-danger-tint)] text-danger hover-fine:bg-[rgba(239,71,71,0.14)] focus-visible:ring-destructive/30",
        link: "text-brand underline underline-offset-2 hover-fine:text-brand-strong",
      },
      size: {
        default: "min-h-[36px] min-w-[36px] h-9 gap-1.5 px-3",
        sm: "min-h-[36px] min-w-[36px] h-9 gap-1.5 px-2.5",
        xs: "min-h-[36px] min-w-[36px] h-9 gap-1 px-2 text-xs",
        lg: "min-h-10 min-w-10 h-10 gap-2 px-4",
        icon: "min-h-[36px] min-w-[36px] size-9",
        "icon-sm": "min-h-[36px] min-w-[36px] size-9",
        "icon-lg": "min-h-10 min-w-10 size-10",
      },
    },
    defaultVariants: {
      variant: "control",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "control",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
