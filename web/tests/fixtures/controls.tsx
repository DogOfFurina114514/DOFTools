import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppearanceProvider, useAppearance } from '../../src/lib/appearance'
import { ToolUI } from '../../src/tools'

function Fixture() {
  const [text, setText] = useState('')
  const [choice, setChoice] = useState('png')
  const [checked, setChecked] = useState(false)
  const [open, setOpen] = useState(false)
  const appearance = useAppearance()
  return (
    <div>
      <ToolUI.TextField label="输出名称" value={text} onValueChange={setText} />
      <ToolUI.Select
        label="输出格式"
        value={choice}
        onValueChange={setChoice}
        options={[
          { value: 'png', label: 'PNG' },
          { value: 'jpg', label: 'JPG' },
        ]}
      />
      <ToolUI.Checkbox label="保留元数据" value={checked} onValueChange={setChecked} />
      <ToolUI.Button onClick={() => appearance.setStyle('material')}>切换原生控件</ToolUI.Button>
      <ToolUI.Button onClick={() => appearance.setStyle('fluent')}>切换 Fluent 控件</ToolUI.Button>
      <ToolUI.Button onClick={() => setOpen(true)}>查看当前值</ToolUI.Button>
      <ToolUI.Dialog open={open} title="当前设置" onClose={() => setOpen(false)}>
        <p>
          {text}|{choice}|{String(checked)}
        </p>
      </ToolUI.Dialog>
    </div>
  )
}
export function mountControls() {
  const el = document.createElement('div')
  el.id = 'controls-fixture'
  el.className = 'ui-panel'
  el.style.margin = '30px 30px 30px 280px'
  document.body.appendChild(el)
  createRoot(el).render(
    <AppearanceProvider>
      <Fixture />
    </AppearanceProvider>,
  )
}
