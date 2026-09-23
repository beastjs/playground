'use client'

import { AnimatedIcon } from '@/components/ui/animated-icon'
import { COPY_FAILED_MESSAGE, useCopy } from '@/lib/use-copy'
import { cn } from '@/lib/utils'
import { CheckCircledIcon, CopyIcon } from '@radix-ui/react-icons'

const roundedClasses = {
  full: 'rounded-full',
  md: 'rounded-md'
} as const

const labels = {
  copied: 'Copied',
  failed: COPY_FAILED_MESSAGE,
  idle: 'Copy to clipboard'
} as const

export function CopyButton({
  className,
  iconClassName,
  rounded = 'md',
  text
}: {
  className?: string
  iconClassName?: string
  rounded?: keyof typeof roundedClasses
  text: string
}) {
  const { copy, status } = useCopy()
  const copied = status === 'copied'

  return (
    <button
      aria-label={labels[status]}
      className={cn(
        'group grid size-7 shrink-0 place-items-center transition-[scale,background-color] duration-200 ease-out hover-hover:hover:bg-background-hovered active:scale-[0.97]',
        roundedClasses[rounded],
        className
      )}
      onClick={() => copy(text)}
      type='button'>
      <AnimatedIcon
        active={copied}
        activeIcon={
          <CheckCircledIcon className={cn('size-4 text-content-subtle will-change-transform', iconClassName)} />
        }
        idleIcon={
          <CopyIcon
            className={cn(
              'size-4 text-content-subtle transition-colors duration-200 ease-out will-change-transform group-hover:text-content',
              iconClassName
            )}
          />
        }
      />
      <span className='sr-only' role='status'>
        {status === 'idle' ? '' : labels[status]}
      </span>
    </button>
  )
}
