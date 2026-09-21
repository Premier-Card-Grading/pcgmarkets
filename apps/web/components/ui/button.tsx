import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-bold text-[14.5px] min-h-11 px-[18px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default: "bg-ink text-ground border border-ink",
        outline: "bg-surface text-ink border border-line",
        ghost: "text-mute bg-transparent",
        danger: "text-bad bg-transparent",
      },
      size: {
        default: "",
        sm: "min-h-9 px-3 text-[13.5px] rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
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
