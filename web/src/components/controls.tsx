import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Minus, Plus, Upload, X } from 'lucide-react'
import { useLocale } from '../lib/i18n'
import { SelectControl } from './SelectControl'
import { useDialogLifecycle } from './useDialogLifecycle'

export interface ValueControlProps<T> {
  label: string
  value: T
  onValueChange: (value: T) => void
  name?: string
  disabled?: boolean
  required?: boolean
  help?: string
  error?: string
}
export interface ChoiceOption {
  value: string
  label: string
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
  children: ReactNode
}) {
  return (
    <button {...props} type={type} className={`button ${variant} ${className}`}>
      {children}
    </button>
  )
}
export function IconButton({
  children,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} type={type} className={`icon-button ${className}`}>
      {children}
    </button>
  )
}
function ControlFrame({
  label,
  id,
  help,
  error,
  children,
}: {
  label: string
  id: string
  help?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className={`ui-field ${error ? 'invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {(help || error) && (
        <small id={`${id}-help`} role={error ? 'alert' : undefined}>
          {error || help}
        </small>
      )}
    </div>
  )
}
export function TextField({
  label,
  value,
  onValueChange,
  name,
  disabled,
  required,
  help,
  error,
  placeholder,
  multiline = false,
}: ValueControlProps<string> & { placeholder?: string; multiline?: boolean }) {
  const id = useId()
  const common = {
    id,
    name,
    value,
    disabled,
    required,
    placeholder,
    'aria-label': label,
    'aria-invalid': !!error,
    'aria-describedby': help || error ? `${id}-help` : undefined,
  }
  return (
    <ControlFrame {...{ label, id, help, error }}>
      {multiline ? (
        <textarea {...common} rows={3} onChange={(event) => onValueChange(event.target.value)} />
      ) : (
        <input {...common} type="text" onChange={(event) => onValueChange(event.target.value)} />
      )}
    </ControlFrame>
  )
}
export function TextArea(props: ValueControlProps<string> & { placeholder?: string }) {
  return <TextField {...props} multiline />
}
function stepped(value: number, min: number, max: number, step: number) {
  const anchor = Number.isFinite(min) ? min : 0
  return Math.max(
    min,
    Math.min(max, Number((anchor + Math.round((value - anchor) / step) * step).toFixed(12))),
  )
}
export function NumberField({
  label,
  value,
  onValueChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  name,
  disabled,
  required,
  help,
  error,
  placeholder,
}: ValueControlProps<number | ''> & {
  min?: number
  max?: number
  step?: number
  placeholder?: string
}) {
  const id = useId(),
    { t } = useLocale()
  const [draft, setDraft] = useState(String(value))
  const localChange = useRef<number | '' | null>(null)
  const numericDraft =
    draft.trim() !== '' &&
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(draft.trim()) &&
    Number.isFinite(Number(draft))
  useEffect(() => {
    if (localChange.current !== value) setDraft(String(value))
    localChange.current = null
  }, [value])
  const update = (next: number) => {
    setDraft(String(next))
    onValueChange(next)
  }
  const move = (direction: number) => {
    const number =
      draft.trim() !== '' && Number.isFinite(Number(draft))
        ? Number(draft)
        : value !== ''
          ? value
          : Number.isFinite(min)
            ? min
            : 0
    update(stepped(number + direction * step, min, max, step))
  }
  return (
    <ControlFrame {...{ label, id, help, error }}>
      <div className="ui-number">
        <input
          id={id}
          type="text"
          role="spinbutton"
          inputMode="decimal"
          name={name}
          value={draft}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          aria-label={label}
          aria-valuenow={value === '' ? undefined : value}
          aria-valuemin={Number.isFinite(min) ? min : undefined}
          aria-valuemax={Number.isFinite(max) ? max : undefined}
          aria-invalid={!!error || (draft.trim() !== '' && !numericDraft)}
          aria-describedby={help || error ? `${id}-help` : undefined}
          onChange={(event) => {
            const raw = event.target.value
            setDraft(raw)
            const next =
              raw.trim() !== '' &&
              /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim()) &&
              Number.isFinite(Number(raw))
                ? Number(raw)
                : ''
            localChange.current = next
            onValueChange(next)
          }}
          onBlur={() => {
            if (draft.trim() === '') {
              setDraft('')
              return
            }
            if (numericDraft) update(stepped(Number(draft), min, max, step))
            else setDraft(String(value))
          }}
          onKeyDown={(event) => {
            const directions: Record<string, number> = {
              ArrowUp: 1,
              ArrowDown: -1,
              PageUp: 10,
              PageDown: -10,
            }
            const direction = directions[event.key]
            if (direction !== undefined) {
              event.preventDefault()
              move(direction)
            }
          }}
        />
        <button
          type="button"
          className="ui-number-step"
          aria-label={t('减少 {label}', 'Decrease {label}', { label })}
          disabled={disabled || (value !== '' && value <= min)}
          onClick={() => move(-1)}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          className="ui-number-step"
          aria-label={t('增加 {label}', 'Increase {label}', { label })}
          disabled={disabled || (value !== '' && value >= max)}
          onClick={() => move(1)}
        >
          <Plus size={16} />
        </button>
      </div>
    </ControlFrame>
  )
}
export const Select = SelectControl

export function Slider({
  label,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  name,
  help,
  error,
}: ValueControlProps<number> & { min?: number; max?: number; step?: number }) {
  const id = useId(),
    dragging = useRef<number | null>(null)
  const normalized = Math.max(min, Math.min(max, value))
  const percent = max === min ? 0 : ((normalized - min) / (max - min)) * 100
  return (
    <ControlFrame {...{ label, id, help, error }}>
      <div className="ui-slider">
        <div
          id={id}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          className="ui-slider-control"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={normalized}
          aria-disabled={disabled}
          aria-invalid={!!error}
          aria-orientation="horizontal"
          data-name={name}
          aria-describedby={help || error ? `${id}-help` : undefined}
          onPointerDown={(event) => {
            if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return
            event.preventDefault()
            event.currentTarget.focus({ preventScroll: true })
            event.currentTarget.setPointerCapture(event.pointerId)
            dragging.current = event.pointerId
            const rect = event.currentTarget.getBoundingClientRect()
            onValueChange(
              stepped(
                min +
                  Math.max(
                    0,
                    Math.min(1, (event.clientX - rect.left - 10) / Math.max(1, rect.width - 20)),
                  ) *
                    (max - min),
                min,
                max,
                step,
              ),
            )
          }}
          onPointerMove={(event) => {
            if (disabled || dragging.current !== event.pointerId) return
            const rect = event.currentTarget.getBoundingClientRect()
            onValueChange(
              stepped(
                min +
                  Math.max(
                    0,
                    Math.min(1, (event.clientX - rect.left - 10) / Math.max(1, rect.width - 20)),
                  ) *
                    (max - min),
                min,
                max,
                step,
              ),
            )
          }}
          onPointerUp={(event) => {
            if (dragging.current === event.pointerId) dragging.current = null
          }}
          onPointerCancel={() => {
            dragging.current = null
          }}
          onLostPointerCapture={() => {
            dragging.current = null
          }}
          onKeyDown={(event) => {
            if (disabled) return
            const directions: Record<string, number> = {
              ArrowRight: 1,
              ArrowUp: 1,
              ArrowLeft: -1,
              ArrowDown: -1,
              PageUp: 10,
              PageDown: -10,
            }
            const direction = directions[event.key]
            if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault()
              onValueChange(event.key === 'Home' ? min : max)
            } else if (direction !== undefined) {
              event.preventDefault()
              onValueChange(
                stepped(normalized + direction * step * (event.shiftKey ? 10 : 1), min, max, step),
              )
            }
          }}
        >
          <span className="ui-slider-track" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
            <span className="ui-slider-thumb" style={{ left: `${percent}%` }} />
          </span>
        </div>
        <output htmlFor={id}>{normalized}</output>
      </div>
    </ControlFrame>
  )
}
export function Switch({
  label,
  value,
  onValueChange,
  disabled,
  help,
}: ValueControlProps<boolean>) {
  return (
    <span className="ui-switch-wrap">
      {help && <small>{help}</small>}
      <button
        type="button"
        className={`toggle ${value ? 'on' : ''}`}
        role="switch"
        aria-label={label}
        aria-checked={value}
        onClick={() => onValueChange(!value)}
        disabled={disabled}
      >
        <span />
      </button>
    </span>
  )
}
export function Checkbox({
  label,
  value,
  onValueChange,
  disabled,
  name,
  help,
}: ValueControlProps<boolean>) {
  return (
    <div className="ui-checkbox">
      <button
        type="button"
        role="checkbox"
        className="ui-checkbox-control"
        name={name}
        value={String(value)}
        aria-label={label}
        aria-checked={value}
        disabled={disabled}
        onClick={() => onValueChange(!value)}
      >
        <span className="ui-checkbox-box" aria-hidden="true">
          {value && <Check size={15} />}
        </span>
        <span>{label}</span>
      </button>
      {help && <small>{help}</small>}
    </div>
  )
}
export function FilePicker({
  label,
  value,
  onValueChange,
  accept,
  multiple = false,
  disabled,
  help,
  error,
}: ValueControlProps<File[]> & { accept?: string; multiple?: boolean }) {
  const { t } = useLocale(),
    input = useRef<HTMLInputElement>(null),
    id = useId()
  const choose = (files: FileList | null) => {
    if (!disabled && files) onValueChange(multiple ? [...files] : [...files].slice(0, 1))
  }
  return (
    <ControlFrame {...{ label, id, help, error }}>
      <div
        className="ui-file-picker"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          choose(event.dataTransfer.files)
        }}
      >
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-label={label}
          hidden
          onChange={(event) => {
            choose(event.target.files)
            event.target.value = ''
          }}
        />
        <Button variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>
          <Upload size={16} />
          {label}
        </Button>
        <span>{t('或拖入文件', 'or drop files here')}</span>
        {value.map((file, index) => (
          <div className="ui-file-row" key={`${file.name}-${index}`}>
            <span>{file.name}</span>
            <button
              type="button"
              disabled={disabled}
              aria-label={t('移除 {name}', 'Remove {name}', { name: file.name })}
              onClick={() => onValueChange(value.filter((_, i) => i !== index))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ControlFrame>
  )
}
export function Progress({
  label,
  value,
  decimals = 0,
}: {
  label: string
  value?: number
  decimals?: 0 | 1 | 2
}) {
  const normalized = value === undefined ? undefined : Math.max(0, Math.min(1, value))
  const percent =
    normalized === undefined ? undefined : Number((normalized * 100).toFixed(decimals))
  return (
    <div className="ui-progress">
      <span>
        {label}
        {percent !== undefined && <b>{percent.toFixed(decimals)}%</b>}
      </span>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className={`ui-progress-track ${normalized === undefined ? 'indeterminate' : ''}`}
      >
        <span style={normalized === undefined ? undefined : { width: `${normalized * 100}%` }} />
      </div>
    </div>
  )
}
export function Panel({
  title,
  children,
  actions,
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="ui-panel">
      <div className="ui-panel-heading">
        <h2>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}
export function Dialog({
  open,
  title,
  onClose,
  children,
  actions,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
}) {
  const { t } = useLocale(),
    ref = useRef<HTMLDivElement>(null),
    id = useId()
  useDialogLifecycle(open, ref, onClose)
  return open
    ? createPortal(
        <div
          className="ui-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          <div
            ref={ref}
            className="ui-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={id}
            tabIndex={-1}
            data-scroll-area=""
          >
            <div className="ui-panel-heading">
              <h2 id={id}>{title}</h2>
              <IconButton aria-label={t('关闭弹窗', 'Close dialog')} onClick={onClose}>
                <X size={19} />
              </IconButton>
            </div>
            {children}
            {actions && <div className="ui-dialog-actions">{actions}</div>}
          </div>
        </div>,
        document.body,
      )
    : null
}
export function Disclosure({
  title,
  children,
  className = '',
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  const id = useId(),
    [open, setOpen] = useState(false)
  return (
    <section className={`ui-disclosure ${className}`}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {title}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </section>
  )
}
export function Tabs({
  label,
  value,
  onValueChange,
  options,
}: ValueControlProps<string> & { options: readonly ChoiceOption[] }) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {options.map((option, index) => (
        <button
          type="button"
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onValueChange(option.value)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) %
                    options.length
            onValueChange(options[next].value)
            ;(event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus()
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
/** Tools retain one stable value/event facade; all visible widgets use theme tokens. */
export const ToolUI = {
  Button,
  TextField,
  TextArea,
  NumberField,
  Select,
  Slider,
  Switch,
  Checkbox,
  FilePicker,
  Progress,
  Panel,
  Dialog,
  Tabs,
} as const
export const useToolUI = () => ToolUI
