import { useEffect, useRef, useState } from 'react'
import { ToolUI } from '../components/controls'
import { useLocale } from '../lib/i18n'
import { errorMessage, type DisplayText } from '../lib/locale'
import {
  toolRegistry,
  type ToolDefinition,
  type ToolField,
  type ToolResult,
  type ToolValues,
} from './registry'

export function ToolFields({
  fields,
  values,
  onValueChange,
  disabled,
}: {
  fields: readonly ToolField[]
  values: ToolValues
  onValueChange: (values: ToolValues) => void
  disabled?: boolean
}) {
  const { resolve } = useLocale()
  return (
    <div className="ui-field-grid">
      {fields.map((field) => {
        const value = values[field.name]
        const update = (value: ToolValues[string]) =>
          onValueChange({ ...values, [field.name]: value })
        const common = {
          label: resolve(field.label),
          name: field.name,
          help: field.help && resolve(field.help),
          required: field.required,
          disabled,
        }
        let control
        switch (field.type) {
          case 'text':
            control = (
              <ToolUI.TextField
                {...common}
                placeholder={field.placeholder && resolve(field.placeholder)}
                value={String(value ?? '')}
                onValueChange={update}
              />
            )
            break
          case 'textarea':
            control = (
              <ToolUI.TextArea
                {...common}
                placeholder={field.placeholder && resolve(field.placeholder)}
                value={String(value ?? '')}
                onValueChange={update}
              />
            )
            break
          case 'select':
            control = (
              <ToolUI.Select
                {...common}
                options={field.options.map((option) => ({
                  value: option.value,
                  label: resolve(option.label),
                }))}
                value={String(value ?? '')}
                onValueChange={update}
              />
            )
            break
          case 'number':
            control = (
              <ToolUI.NumberField
                {...common}
                min={field.min}
                max={field.max}
                step={field.step}
                value={value === '' ? '' : Number(value ?? 0)}
                onValueChange={update}
              />
            )
            break
          case 'slider':
            control = (
              <ToolUI.Slider
                {...common}
                min={field.min}
                max={field.max}
                step={field.step}
                value={Number(value ?? 0)}
                onValueChange={update}
              />
            )
            break
          case 'checkbox':
            control = <ToolUI.Checkbox {...common} value={!!value} onValueChange={update} />
            break
          case 'switch':
            control = (
              <div className="ui-setting">
                <span>{resolve(field.label)}</span>
                <ToolUI.Switch {...common} value={!!value} onValueChange={update} />
              </div>
            )
            break
          case 'files':
            control = (
              <ToolUI.FilePicker
                {...common}
                accept={field.accept}
                multiple={field.multiple}
                value={Array.isArray(value) ? value : []}
                onValueChange={update}
              />
            )
            break
        }
        return <div key={field.name}>{control}</div>
      })}
    </div>
  )
}

export function ToolWorkspace({ tool }: { tool: ToolDefinition }) {
  const { t, resolve, locale } = useLocale()
  const [values, setValues] = useState<ToolValues>(tool.initialValues)
  const [result, setResult] = useState<ToolResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<DisplayText>('')
  const controller = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      controller.current?.abort()
      controller.current = null
    },
    [],
  )
  const run = async () => {
    if (controller.current) return
    setError('')
    setResult(null)
    setBusy(true)
    setProgress(0)
    const abort = new AbortController()
    controller.current = abort
    try {
      const result = await toolRegistry.run(tool.id, values, {
        locale,
        signal: abort.signal,
        onProgress: (value) => {
          if (controller.current === abort && !abort.signal.aborted) setProgress(value)
        },
      })
      if (controller.current === abort) setResult(result)
    } catch (error) {
      if (!abort.signal.aborted) setError(errorMessage(error))
    } finally {
      if (controller.current === abort) {
        controller.current = null
        setBusy(false)
      }
    }
  }
  return (
    <ToolUI.Panel title={resolve(tool.title)}>
      <p className="ui-panel-description">{resolve(tool.description)}</p>
      <ToolFields fields={tool.fields} values={values} onValueChange={setValues} disabled={busy} />
      {busy && <ToolUI.Progress label={t('正在处理', 'Processing')} value={progress} />}
      {error && (
        <p className="error-message" role="alert">
          {resolve(error)}
        </p>
      )}
      <div className="ui-actions">
        <ToolUI.Button type="button" disabled={busy} onClick={run}>
          {t('开始处理', 'Run tool')}
        </ToolUI.Button>
        {busy ? (
          <ToolUI.Button variant="secondary" onClick={() => controller.current?.abort()}>
            {t('取消', 'Cancel')}
          </ToolUI.Button>
        ) : (
          <ToolUI.Button
            variant="secondary"
            onClick={() => {
              setValues(tool.initialValues)
              setResult(null)
              setError('')
            }}
          >
            {t('重置', 'Reset')}
          </ToolUI.Button>
        )}
      </div>
      {result && (
        <div className="ui-result" role="status">
          <p>{resolve(result.summary)}</p>
          {result.preview}
          {result.files?.map((file) => (
            <ToolUI.Button
              key={file.name}
              variant="secondary"
              onClick={() => {
                const url = URL.createObjectURL(file.blob)
                const link = document.createElement('a')
                link.href = url
                link.download = file.name
                link.click()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
              }}
            >
              {t('下载', 'Download')} {file.name}
            </ToolUI.Button>
          ))}
        </div>
      )}
    </ToolUI.Panel>
  )
}
