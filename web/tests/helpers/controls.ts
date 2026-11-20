import { expect, type Locator } from '@playwright/test'

export async function selectChoice(trigger: Locator, value: string) {
  const button = trigger.and(trigger.page().getByRole('combobox'))
  await button.click()
  const id = await button.getAttribute('aria-controls')
  expect(id).toBeTruthy()
  const popup = trigger
    .page()
    .getByRole('listbox')
    .filter({ has: trigger.page().locator(`[data-value="${value}"]`) })
  await expect(popup).toHaveAttribute('id', id!)
  await popup.locator(`[role="option"][data-value="${value}"]`).click()
  await expect(button).toHaveAttribute('data-value', value)
}
