import { expect, test } from 'vitest'
import { PAGES_RESOURCE_BASE, resourceBase } from '../src/lib/site-resources'

test('production and ESA mirrors fetch resources from the HTTPS Pages CNAME', () => {
  for (const origin of [
    'https://backup.example/',
    'https://dogoffurina114514.github.io/DOFTools/',
    PAGES_RESOURCE_BASE,
  ])
    expect(resourceBase(origin, false)).toBe('https://toolbox.owo.lat/')
})

test('development keeps local resources and repository base paths', () => {
  expect(resourceBase('http://localhost:5173/DOFTools/', true)).toBe(
    'http://localhost:5173/DOFTools/',
  )
})
