import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 overflow-hidden",
      "border-0 data-[state=checked]:border-0 data-[state=unchecked]:border-0",
      className
    )}
    {...props}
    ref={ref}
  >
    {/* Track background with flat styling */}
    <span 
      className="absolute inset-0 rounded-full" 
      data-state={props.checked ? "checked" : "unchecked"}
      style={{
        background: props.checked 
          ? 'var(--green-500, #10b981)' // Default to green with fallback
          : 'hsl(220, 13%, 25%)',
        border: '1px solid rgba(0, 0, 0, 0.2)'
      }}
    />
    
    {/* Sliding thumb with flat styling */}
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none absolute z-10 block h-3 w-3 rounded-full transition-all duration-300 ease-in-out",
        "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5",
        "switch-thumb"
      )}
      style={{
        background: 'hsl(0, 0%, 95%)',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
      }}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
