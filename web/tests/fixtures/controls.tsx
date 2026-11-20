import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppearanceProvider, useAppearance } from '../../src/lib/appearance'
import { ToolUI } from '../../src/tools'

function Fixture() {
  const [text, setText] = useState('')
  const [choice, setChoice] = useState('png')
  const [checked, setChecked] = useState(false)
  const [open, setOpen] = useState(false)
  const [nested, setNested] = useState(false)
  const [number, setNumber] = useState<number | ''>(1.5)
  const [slider, setSlider] = useState(30)
  const [long, setLong] = useState('29')
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
      <ToolUI.NumberField
        label="小数"
        value={number}
        onValueChange={setNumber}
        min={0}
        max={10}
        step={0.1}
      />
      <ToolUI.Slider label="测试滑块" value={slider} onValueChange={setSlider} />
      <ToolUI.Select
        label="长列表"
        value={long}
        onValueChange={setLong}
        options={Array.from({ length: 30 }, (_, index) => ({
          value: String(index),
          label: `Item ${index}`,
        }))}
      />
      <ToolUI.Select
        label="禁用选择"
        value="png"
        onValueChange={setChoice}
        disabled
        options={[{ value: 'png', label: 'PNG' }]}
      />
      <ToolUI.Button onClick={() => appearance.setStyle('material')}>
        切换 Material 控件
      </ToolUI.Button>
      <ToolUI.Button onClick={() => appearance.setStyle('fluent')}>切换 Fluent 控件</ToolUI.Button>
      <ToolUI.Button onClick={() => setOpen(true)}>查看当前值</ToolUI.Button>
      <ToolUI.Dialog open={open} title="当前设置" onClose={() => setOpen(false)}>
        <p>
          {text}|{choice}|{String(checked)}
        </p>
        <ToolUI.Select
          label="弹窗格式"
          value={choice}
          onValueChange={setChoice}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpg', label: 'JPG' },
          ]}
        />
        <ToolUI.Button onClick={() => setNested(true)}>嵌套弹窗</ToolUI.Button>
        <ToolUI.Dialog open={nested} title="第二层" onClose={() => setNested(false)}>
          <ToolUI.TextField label="第二层输入" value={text} onValueChange={setText} />
        </ToolUI.Dialog>
      </ToolUI.Dialog>
    </div>
  )
}
export function mountControls() {
  const el = document.createElement('div')
  el.id = 'controls-fixture'
  el.className = 'ui-panel'
  el.style.margin = innerWidth > 700 ? '30px 30px 30px 280px' : '20px'
  document.body.appendChild(el)
  createRoot(el).render(
    <AppearanceProvider>
      <Fixture />
    </AppearanceProvider>,
  )
}
