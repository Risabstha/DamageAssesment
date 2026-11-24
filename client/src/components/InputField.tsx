import type { ComponentProps } from 'react'

export default function InputField({ type, className = '', ...props }: ComponentProps<'input'>) {
  const styles = type === 'range'
    ? 'm-0 w-full border-0 p-0 accent-[#e8590c]'
    : ` w-full rounded-[6px] border border-[#c9d9dd] bg-white p-[10px]  ${type === 'file' ? 'text-[.78rem]' : ''}`
  return <input type={type} className={`${styles} ${className}`} {...props} />
}
