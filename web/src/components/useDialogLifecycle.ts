import { useLayoutEffect, useRef, type RefObject } from 'react'

export function useDialogLifecycle(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const close = useRef(onClose)
  close.current = onClose
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    const backdrop = dialog.parentElement
    const backgrounds = [...document.body.children]
      .filter((element) => element !== backdrop && !element.classList.contains('theme-scrollbars'))
      .map((element) => ({
        element: element as HTMLElement,
        inert: element.hasAttribute('inert'),
        hidden: element.getAttribute('aria-hidden'),
      }))
    backgrounds.forEach(({ element }) => {
      element.setAttribute('inert', '')
      element.setAttribute('aria-hidden', 'true')
    })
    document.body.style.overflow = 'hidden'
    const focusable = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled):not([hidden]), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (element) => element.getClientRects().length && !element.closest('[hidden], [inert]'),
      )
    ;(focusable()[0] ?? dialog).focus({ preventScroll: true })
    const keyboard = (event: KeyboardEvent) => {
      if (dialog.closest('[inert]')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab') return
      const controls = focusable(),
        first = controls[0],
        last = controls.at(-1)
      if (!first) {
        event.preventDefault()
        dialog.focus()
        return
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault()
        last?.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === dialog)
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    const focus = (event: FocusEvent) => {
      if (dialog.closest('[inert]')) return
      if (!dialog.contains(event.target as Node))
        (focusable()[0] ?? dialog).focus({ preventScroll: true })
    }
    document.addEventListener('keydown', keyboard)
    document.addEventListener('focusin', focus)
    return () => {
      document.removeEventListener('keydown', keyboard)
      document.removeEventListener('focusin', focus)
      backgrounds.forEach(({ element, inert, hidden }) => {
        if (!inert) element.removeAttribute('inert')
        if (hidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', hidden)
      })
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [open, ref])
}
