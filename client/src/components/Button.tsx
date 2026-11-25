import type { ComponentProps } from 'react'

type Props = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'link'
  size?: 'normal' | 'small'
}

export default function Button({ type = 'button', variant = 'primary', size = 'normal', className = '', ...props }: Props) {
  const colors = {
    primary: 'bg-[#12776f] text-white',
    secondary: 'bg-[#E8E9E3] text-[0.8rem] text-[#185e5a] hover:bg-[#d6d7c9]',
    link: 'bg-transparent text-left text-[#12776f]',
  }
  const padding = variant === 'link' ? 'p-0' : size === 'small' ? 'px-[14px] py-[8px]' : 'w-full px-[14px] py-[8px]'
  return <button type={type} className={`cursor-pointer rounded-[6px] border-0 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${colors[variant]} ${padding} ${className}`} {...props} />
}
