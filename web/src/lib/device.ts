export function isMobileDevice() {
  return Boolean(
    (navigator as Navigator & { userAgentData?: { mobile: boolean } }).userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  )
}
