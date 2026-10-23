import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

export const controlClass =
  'block w-full rounded-[3px] border border-field bg-bg px-3 text-sm text-ink placeholder:text-faint disabled:opacity-60 aria-[invalid=true]:border-danger'

interface FieldShellProps { id: string; label: string; required?: boolean; error?: string; hint?: string; className?: string; children: ReactNode }
export function FieldShell({ id, label, required, error, hint, className, children }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm text-ink">
        {label}
        {required && <span className="ml-0.5 text-required" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (obrigatório)</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-faint">{hint}</p>}
      {/* Erro associado ao campo (aria-describedby) e anunciado ao aparecer; o ícone/texto evita depender só de cor. */}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-danger"><span aria-hidden="true">✕ </span>{error}</p>}
    </div>
  )
}
const describe = (id: string, error?: string, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined)

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> { label: string; error?: string; hint?: string; wrapperClassName?: string }
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(({ label, error, hint, required, className, wrapperClassName, id: idProp, ...props }, ref) => {
  const uid = useId(); const id = idProp ?? uid
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint} className={wrapperClassName}>
      <input ref={ref} id={id} required={required} aria-required={required} aria-invalid={!!error} aria-describedby={describe(id, error, hint)} className={cn(controlClass, 'h-10', className)} {...props} />
    </FieldShell>
  )
})
TextField.displayName = 'TextField'

export const PasswordField = forwardRef<HTMLInputElement, TextFieldProps>(({ label, error, hint, required, className, wrapperClassName, id: idProp, ...props }, ref) => {
  const uid = useId(); const id = idProp ?? uid
  const [show, setShow] = useState(false)
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint} className={wrapperClassName}>
      <div className="relative">
        <input ref={ref} id={id} type={show ? 'text' : 'password'} required={required} aria-invalid={!!error} aria-describedby={describe(id, error, hint)} className={cn(controlClass, 'h-10 pr-11', className)} {...props} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-faint hover:text-accent-hi">
          {show ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
        </button>
      </div>
    </FieldShell>
  )
})
PasswordField.displayName = 'PasswordField'

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> { label: string; error?: string; hint?: string; placeholder?: string; wrapperClassName?: string }
/** <select> nativo estilizado: teclado, leitores de tela e picker mobile corretos sem custo extra. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(({ label, error, hint, required, placeholder, children, className, wrapperClassName, id: idProp, ...props }, ref) => {
  const uid = useId(); const id = idProp ?? uid
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint} className={wrapperClassName}>
      <select ref={ref} id={id} required={required} aria-invalid={!!error} aria-describedby={describe(id, error, hint)} className={cn(controlClass, 'h-10 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%23cfb28c%27 stroke-width=%272%27%3E%3Cpath d=%27m3 6 5 5 5-5%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
    </FieldShell>
  )
})
SelectField.displayName = 'SelectField'

interface AreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { label: string; error?: string; hint?: string }
export const TextAreaField = forwardRef<HTMLTextAreaElement, AreaProps>(({ label, error, hint, className, id: idProp, ...props }, ref) => {
  const uid = useId(); const id = idProp ?? uid
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <textarea ref={ref} id={id} aria-invalid={!!error} aria-describedby={describe(id, error, hint)} className={cn(controlClass, 'min-h-32 py-2', className)} {...props} />
    </FieldShell>
  )
})
TextAreaField.displayName = 'TextAreaField'
