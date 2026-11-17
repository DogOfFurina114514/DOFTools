import {
  createElement,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { Upload, X } from 'lucide-react'
import { useAppearance } from '../lib/appearance'
import { useLocale } from '../lib/i18n'
import {
  Button as FluentButton,
  Input as FluentInput,
  Textarea as FluentTextarea,
  Select as FluentSelect,
  Slider as FluentSlider,
  Switch as FluentSwitch,
  Checkbox as FluentCheckbox,
  ProgressBar as FluentProgress,
} from '@fluentui/react-components'

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
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
  children: ReactNode
}) {
  const { style, materialReady } = useAppearance()
  if (style === 'fluent')
    return (
      <FluentButton
        {...props}
        appearance={variant === 'primary' ? 'primary' : 'secondary'}
        className={`native-fluent-button ${className}`}
      >
        {children}
      </FluentButton>
    )
  if (style === 'material' && materialReady)
    return createElement(
      variant === 'primary' ? 'md-filled-button' : 'md-outlined-button',
      { ...props, className: `native-material-button ${className}` },
      children,
    )
  return (
    <button {...props} className={`button ${variant} ${className}`}>
      {children}
    </button>
  )
}

export function IconButton({
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { style, materialReady } = useAppearance()
  const classes = `icon-button ${className}`
  if (style === 'fluent')
    return (
      <FluentButton {...props} className={classes} appearance="subtle" icon={<>{children}</>} />
    )
  return style === 'material' && materialReady ? (
    createElement(
      'md-icon-button',
      { ...props, className: `${classes} native-material-icon-button` },
      children,
    )
  ) : (
    <button {...props} className={classes}>
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
  floatingLabel = false,
}: {
  label: string
  id: string
  help?: string
  error?: string
  children: ReactNode
  floatingLabel?: boolean
}) {
  return (
    <div className={`ui-field ${error ? 'invalid' : ''}`}>
      {!floatingLabel && <label htmlFor={id}>{label}</label>}
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
  const { style, materialReady } = useAppearance()
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
    <ControlFrame
      {...{ label, id, help, error }}
      floatingLabel={style === 'material' && materialReady}
    >
      {style === 'material' && materialReady ? (
        createElement('md-outlined-text-field', {
          ...common,
          label,
          type: multiline ? 'textarea' : 'text',
          rows: multiline ? 3 : undefined,
          error: !!error,
          onInput: (event: Event) => onValueChange((event.currentTarget as HTMLInputElement).value),
        })
      ) : style === 'fluent' ? (
        multiline ? (
          <FluentTextarea
            {...common}
            resize="vertical"
            rows={3}
            onChange={(_, data) => onValueChange(data.value)}
          />
        ) : (
          <FluentInput {...common} size="large" onChange={(_, data) => onValueChange(data.value)} />
        )
      ) : multiline ? (
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

export function NumberField({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  name,
  disabled,
  required,
  help,
  error,
}: ValueControlProps<number | ''> & { min?: number; max?: number; step?: number }) {
  const id = useId()
  const { style, materialReady } = useAppearance()
  const change = (raw: string) => onValueChange(raw === '' ? '' : Number(raw))
  const common = {
    id,
    name,
    value,
    min,
    max,
    step,
    disabled,
    required,
    'aria-label': label,
    'aria-invalid': !!error,
    'aria-describedby': help || error ? `${id}-help` : undefined,
  }
  return (
    <ControlFrame
      {...{ label, id, help, error }}
      floatingLabel={style === 'material' && materialReady}
    >
      {style === 'material' && materialReady ? (
        createElement('md-outlined-text-field', {
          ...common,
          label,
          type: 'number',
          error: !!error,
          onInput: (event: Event) => change((event.currentTarget as HTMLInputElement).value),
        })
      ) : style === 'fluent' ? (
        <FluentInput
          {...common}
          value={String(value)}
          size="large"
          type="number"
          onChange={(_, data) => change(data.value)}
        />
      ) : (
        <input {...common} type="number" onChange={(event) => change(event.target.value)} />
      )}
    </ControlFrame>
  )
}

export function Select({
  label,
  value,
  onValueChange,
  options,
  name,
  disabled,
  required,
  help,
  error,
}: ValueControlProps<string> & { options: readonly ChoiceOption[] }) {
  const id = useId()
  const { style, materialReady } = useAppearance()
  return (
    <ControlFrame
      {...{ label, id, help, error }}
      floatingLabel={style === 'material' && materialReady}
    >
      {style === 'material' && materialReady ? (
        createElement(
          'md-outlined-select',
          {
            id,
            name,
            label,
            value,
            disabled,
            required,
            error: !!error,
            'aria-label': label,
            onchange: (event: Event) =>
              onValueChange((event.currentTarget as HTMLSelectElement).value),
          },
          options.map((option) =>
            createElement(
              'md-select-option',
              { key: option.value, value: option.value },
              <span slot="headline">{option.label}</span>,
            ),
          ),
        )
      ) : style === 'fluent' ? (
        <FluentSelect
          id={id}
          name={name}
          value={value}
          disabled={disabled}
          required={required}
          aria-label={label}
          aria-invalid={!!error}
          onChange={(_, data) => onValueChange(data.value)}
          size="large"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FluentSelect>
      ) : (
        <select
          id={id}
          name={name}
          value={value}
          disabled={disabled}
          required={required}
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={help || error ? `${id}-help` : undefined}
          onChange={(event) => onValueChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </ControlFrame>
  )
}

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
  const id = useId()
  const { style, materialReady } = useAppearance()
  return (
    <ControlFrame {...{ label, id, help, error }}>
      <div className="ui-slider">
        {style === 'material' && materialReady ? (
          createElement('md-slider', {
            id,
            name,
            value,
            min,
            max,
            step,
            disabled,
            labeled: true,
            'aria-label': label,
            onInput: (event: Event) =>
              onValueChange(Number((event.currentTarget as HTMLInputElement).value)),
          })
        ) : style === 'fluent' ? (
          <FluentSlider
            id={id}
            name={name}
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            aria-label={label}
            onChange={(_, data) => onValueChange(data.value)}
          />
        ) : (
          <input
            id={id}
            name={name}
            type="range"
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            aria-label={label}
            onChange={(event) => onValueChange(Number(event.target.value))}
          />
        )}
        <output htmlFor={id}>{value}</output>
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
  const { style, materialReady } = useAppearance()
  const ref = useRef<HTMLElement & { selected?: boolean }>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const change = () => onValueChange(!!element.selected)
    element.addEventListener('change', change)
    return () => element.removeEventListener('change', change)
  }, [style, materialReady, onValueChange])
  return (
    <span className="ui-switch-wrap">
      {help && <small>{help}</small>}
      {style === 'material' && materialReady ? (
        createElement('md-switch', { ref, selected: value, disabled, 'aria-label': label })
      ) : style === 'fluent' ? (
        <FluentSwitch
          aria-label={label}
          checked={value}
          disabled={disabled}
          onChange={(_, data) => onValueChange(data.checked)}
        />
      ) : (
        <button
          className={`toggle ${value ? 'on' : ''}`}
          role="switch"
          aria-label={label}
          aria-checked={value}
          onClick={() => onValueChange(!value)}
          disabled={disabled}
        >
          <span />
        </button>
      )}
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
  const id = useId()
  const { style, materialReady } = useAppearance()
  if (style === 'fluent')
    return (
      <div className="ui-checkbox">
        <FluentCheckbox
          id={id}
          name={name}
          label={label}
          checked={value}
          disabled={disabled}
          onChange={(_, data) => onValueChange(data.checked === true)}
        />
        {help && <small>{help}</small>}
      </div>
    )
  return (
    <div className="ui-checkbox">
      <label htmlFor={id}>
        {style === 'material' && materialReady ? (
          createElement('md-checkbox', {
            id,
            name,
            checked: value,
            disabled,
            'aria-label': label,
            onchange: (event: Event) =>
              onValueChange((event.currentTarget as HTMLInputElement).checked),
          })
        ) : (
          <input
            id={id}
            name={name}
            type="checkbox"
            checked={value}
            disabled={disabled}
            onChange={(event) => onValueChange(event.target.checked)}
          />
        )}
        <span>{label}</span>
      </label>
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
  const { t } = useLocale()
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
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
          onChange={(event) => {
            choose(event.target.files)
            event.target.value = ''
          }}
          hidden
        />
        <Button
          variant="secondary"
          disabled={disabled}
          type="button"
          onClick={() => input.current?.click()}
        >
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

export function Progress({ label, value }: { label: string; value?: number }) {
  const { style, materialReady } = useAppearance()
  const normalized = value === undefined ? undefined : Math.max(0, Math.min(1, value))
  return (
    <div className="ui-progress">
      <span>
        {label}
        {normalized !== undefined && <b>{Math.round(normalized * 100)}%</b>}
      </span>
      {style === 'material' && materialReady ? (
        createElement('md-linear-progress', {
          value: normalized,
          indeterminate: normalized === undefined,
          'aria-label': label,
        })
      ) : style === 'fluent' ? (
        <FluentProgress aria-label={label} max={1} value={normalized} />
      ) : (
        <progress aria-label={label} max={1} value={normalized} />
      )}
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
  const { t } = useLocale()
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="ui-dialog"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose()
        }
      }}
    >
      <div className="ui-panel-heading">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('关闭弹窗', 'Close dialog')}
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
      {actions && <div className="ui-dialog-actions">{actions}</div>}
    </dialog>
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

/** Tools import this single facade; values/events are independent of the selected theme. */
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
