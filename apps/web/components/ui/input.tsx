import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[15px] font-medium text-ink placeholder:text-mute placeholder:font-normal focus-visible:border-teal focus-visible:ring-[3px] focus-visible:ring-teal-soft outline-none",
        className
      )}
      {...props}
    />
  )
}

export { Input }
