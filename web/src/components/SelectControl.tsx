import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import type { ChoiceOption, ValueControlProps } from './controls'

interface Placement {
  left: number
  top: number
  width: number
  maxHeight: number
}

/** Shared, themeable listbox. Focus stays on the trigger for keyboard and touch AT. */
export function SelectControl({
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
  const id = useId(),
    listId = `${id}-list`
  const trigger = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null)
  const search = useRef({ text: '', time: 0 })
  const [open, setOpen] = useState(false),
    [activeValue, setActiveValue] = useState(value)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const selected = options.findIndex((option) => option.value === value)
  const active = Math.max(
    0,
    options.findIndex((option) => option.value === activeValue),
  )
  const unavailable = disabled || !options.length
  const show = (index = Math.max(0, selected)) => {
    if (unavailable) return
    setActiveValue(options[index].value)
    setPlacement(null)
    setOpen(true)
  }
  const choose = (index: number) => {
    onValueChange(options[index].value)
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }

  useLayoutEffect(() => {
    if (!open) return
    if (unavailable) {
      setOpen(false)
      return
    }
    let frame = 0
    const align = () => {
      const button = trigger.current,
        popup = list.current
      if (!button || !popup || !button.isConnected || button.closest('[inert]')) {
        setOpen(false)
        return
      }
      const rect = button.getBoundingClientRect(),
        viewport = window.visualViewport
      const left = viewport?.offsetLeft ?? 0,
        top = viewport?.offsetTop ?? 0
      const width = viewport?.width ?? innerWidth,
        height = viewport?.height ?? innerHeight
      let visibleLeft = left,
        visibleTop = top,
        visibleRight = left + width,
        visibleBottom = top + height
      for (let parent = button.parentElement; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent),
          clip = parent.getBoundingClientRect()
        if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) {
          visibleLeft = Math.max(visibleLeft, clip.left)
          visibleRight = Math.min(visibleRight, clip.right)
        }
        if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) {
          visibleTop = Math.max(visibleTop, clip.top)
          visibleBottom = Math.min(visibleBottom, clip.bottom)
        }
      }
      if (
        rect.bottom <= visibleTop ||
        rect.top >= visibleBottom ||
        rect.right <= visibleLeft ||
        rect.left >= visibleRight
      ) {
        setOpen(false)
        return
      }
      const below = top + height - rect.bottom - 14,
        above = rect.top - top - 14
      const wanted = Math.min(320, popup.scrollHeight)
      const down = below >= Math.min(wanted, 180) || below >= above
      const maxHeight = Math.max(28, Math.min(320, down ? below : above))
      const popupWidth = Math.min(Math.max(160, rect.width), width - 16)
      const next = {
        left: Math.max(left + 8, Math.min(rect.left, left + width - popupWidth - 8)),
        top: down ? rect.bottom + 6 : rect.top - Math.min(wanted, maxHeight) - 6,
        width: popupWidth,
        maxHeight,
      }
      setPlacement((previous) =>
        previous &&
        Object.keys(next).every(
          (key) => Math.abs(previous[key as keyof Placement] - next[key as keyof Placement]) < 0.5,
        )
          ? previous
          : next,
      )
      // Follow transforms as well as scrolling, resize and the mobile viewport.
      frame = requestAnimationFrame(align)
    }
    const outside = (event: PointerEvent | FocusEvent) => {
      const target = event.target as Node
      const rail = target instanceof Element ? target.closest('[role="scrollbar"]') : null
      if (rail?.getAttribute('aria-controls') === listId) return
      if (!trigger.current?.contains(target) && !list.current?.contains(target)) setOpen(false)
    }
    align()
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside)
    }
  }, [open, unavailable, listId])

  useLayoutEffect(() => {
    const popup = list.current,
      option = popup?.children[active] as HTMLElement | undefined
    if (!open || !popup || !option) return
    if (option.offsetTop < popup.scrollTop) popup.scrollTop = option.offsetTop
    else if (option.offsetTop + option.offsetHeight > popup.scrollTop + popup.clientHeight)
      popup.scrollTop = option.offsetTop + option.offsetHeight - popup.clientHeight
  }, [open, active, placement?.maxHeight])

  const keyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (unavailable) return
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (['Enter', ' '].includes(event.key)) {
      event.preventDefault()
      if (open) choose(active)
      else show()
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      if (!open)
        show(
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : Math.max(0, selected),
        )
      else
        setActiveValue(
          options[
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? options.length - 1
                : (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
          ].value,
        )
      return
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault()
    const now = Date.now(),
      letter = event.key.normalize('NFKC').toLocaleLowerCase()
    search.current.text = now - search.current.time > 700 ? letter : search.current.text + letter
    search.current.time = now
    const needle = [...search.current.text].every((char) => char === letter)
      ? letter
      : search.current.text
    const start = open ? active : Math.max(0, selected)
    for (let offset = 1; offset <= options.length; offset++) {
      const index = (start + offset) % options.length
      if (options[index].label.normalize('NFKC').toLocaleLowerCase().startsWith(needle)) {
        if (open) setActiveValue(options[index].value)
        else show(index)
        break
      }
    }
  }

  return (
    <div className={`ui-field ${error ? 'invalid' : ''}`}>
      <label id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        name={name}
        value={value}
        data-value={value}
        className="ui-select-trigger"
        disabled={unavailable}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={help || error ? `${id}-help` : undefined}
        onPointerDown={(event) => {
          if (unavailable || event.button !== 0) return
          event.preventDefault()
          event.currentTarget.focus({ preventScroll: true })
        }}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={keyboard}
      >
        <span>{options[selected]?.label ?? value}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {(help || error) && (
        <small id={`${id}-help`} role={error ? 'alert' : undefined}>
          {error || help}
        </small>
      )}
      {open &&
        createPortal(
          <div
            ref={list}
            id={listId}
            className="ui-select-list"
            role="listbox"
            aria-label={label}
            data-scroll-area=""
            style={placement ?? { visibility: 'hidden' }}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                data-value={option.value}
                data-active={index === active}
                className="ui-select-option"
                onPointerMove={() => setActiveValue(option.value)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {option.value === value && <Check size={17} aria-hidden="true" />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
