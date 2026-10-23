import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-bg hover:bg-accent-hi',
        outline: 'border border-accent text-accent hover:bg-accent/10',
        ghost: 'text-accent hover:text-accent-hi',
        quiet: 'bg-surface text-ink hover:bg-surface-2',
      },
      size: { sm: 'h-8 px-3 text-xs rounded', md: 'h-10 px-4 text-sm rounded', lg: 'h-12 px-6 text-sm rounded', icon: 'size-10 rounded-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, type = 'button', ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} {...(asChild ? {} : { type })} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})
Button.displayName = 'Button'
