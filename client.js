window.__ModuleLoader__.load({
  id: 'dsh-harmony',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { createElement: h, useEffect, useMemo, useRef, useState } = React

    const css = `
.dshHarmonyPage{height:100%;min-height:0;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary)}
.dshHarmonyTabs{flex:none;display:flex;gap:22px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dshHarmonyTab{position:relative;padding:0 2px 10px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;cursor:pointer}
.dshHarmonyTab[aria-selected=true]{color:var(--dsw-alias-label-primary);font-weight:600}
.dshHarmonyTab[aria-selected=true]::after{content:'';position:absolute;right:0;bottom:-1px;left:0;height:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-state-business-primary)}
.dshHarmonyTab:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dshHarmonyHeading{margin:0;font-size:18px;line-height:26px;font-weight:600}
.dshHarmonyIntro{max-width:68ch;margin:2px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.dshHarmonyWorkspace{flex:1;min-height:0;display:grid;grid-template-columns:minmax(210px,2fr) minmax(0,3fr);gap:14px}
.dshHarmonyList{min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px;margin:0;padding:6px;list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dshHarmonyRow{width:100%;min-height:44px;display:flex;align-items:center;gap:9px;padding:8px 9px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:grab;user-select:none;touch-action:none}
.dshHarmonyRow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshHarmonyRow[data-selected=true]{background:var(--dsw-specific-sidebar-nav-item-active)}
.dshHarmonyRow[data-dragging=true]{opacity:.58;cursor:grabbing}
.dshHarmonyRow[data-fixed=true]{cursor:default}
.dshHarmonyRow:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dshHarmonyGrip{flex:none;width:12px;color:var(--dsw-alias-label-tertiary);font-size:15px;line-height:16px;letter-spacing:-3px}
.dshHarmonyIndex{flex:none;width:22px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:11px;text-align:right}
.dshHarmonyName{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px}
.dshHarmonyBadge{flex:none;border-radius:5px;padding:1px 5px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 11%,transparent);color:var(--dsw-alias-state-business-primary);font-size:10px;line-height:16px}
.dshHarmonyDetail{min-width:0;min-height:0;display:flex;flex-direction:column;gap:12px;overflow-y:auto}
.dshHarmonyPreview{position:relative;flex:none;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:12px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary)}
.dshHarmonyPreviewImage{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.dshHarmonyPreviewImageDark{display:none}
body[data-ds-dark-theme] .dshHarmonyPreviewImageLight{display:none}
body[data-ds-dark-theme] .dshHarmonyPreviewImageDark{display:block}
.dshHarmonyPreviewMark{width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:22px;font-weight:600}
.dshHarmonyPreviewLabel{position:absolute;right:10px;bottom:8px;font-size:11px}
.dshHarmonyNavIcon{display:inline-block;width:16px;height:16px;background:currentColor;-webkit-mask:url('/dsh-harmony/assets/harmony-icon-mono.png') center/contain no-repeat;mask:url('/dsh-harmony/assets/harmony-icon-mono.png') center/contain no-repeat}
.dshHarmonyIdentity{display:flex;flex-direction:column;gap:2px}
.dshHarmonyMeta{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dshHarmonyTitle{min-width:0;margin:0;overflow-wrap:anywhere;font-size:16px;line-height:24px;font-weight:600}
.dshHarmonyVersion{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:20px}
.dshHarmonyScope{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dshHarmonyDescription{max-width:70ch;margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:21px;text-wrap:pretty}
.dshHarmonyConstraint{margin:0;padding:9px 10px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:19px}
.dshHarmonyFacts{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}
.dshHarmonyFacts a{color:var(--dsw-alias-state-business-primary);text-decoration:none}
.dshHarmonyFacts a:hover{text-decoration:underline}
.dshHarmonyFacts a:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dshHarmonyPatchPage{flex:1;min-height:0;display:flex;flex-direction:column;gap:14px}
.dshHarmonyPatchWorkspace{flex:1;min-height:0;display:grid;grid-template-columns:minmax(260px,2fr) minmax(0,3fr);gap:14px}
.dshHarmonyPatchList{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:5px;margin:0;padding:6px;list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dshHarmonyPatchRow{width:100%;display:grid;grid-template-columns:8px minmax(0,1fr);gap:9px;padding:9px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dshHarmonyPatchRow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshHarmonyPatchRow[aria-selected=true]{background:var(--dsw-specific-sidebar-nav-item-active)}
.dshHarmonyPatchRow:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dshHarmonyPatchState{width:8px;height:8px;margin-top:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.dshHarmonyPatchState[data-state=bound]{background:var(--dsw-alias-state-business-primary)}
.dshHarmonyPatchState[data-state=failed]{background:var(--dsw-alias-state-error-primary)}
.dshHarmonyPatchState[data-state=disabled]{background:var(--dsw-alias-label-tertiary)}
.dshHarmonyPatchKey{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:19px;font-weight:600}
.dshHarmonyPatchTarget{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.dshHarmonyPatchDetail{min-width:0;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dshHarmonyPatchHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dshHarmonyPatchCode{min-height:160px;overflow:auto;margin:0;padding:12px;border-radius:9px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font:11px/18px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre}
.dshHarmonyPatchChain{display:flex;flex-wrap:wrap;gap:6px}
.dshHarmonyPatchChain span{padding:3px 7px;border-radius:6px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:16px}
.dshHarmonyFooter{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
.dshHarmonyHint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}
.dshHarmonyButton{min-width:68px;height:30px;padding:0 12px;border:0;border-radius:8px;background:var(--dsw-alias-state-business-primary);color:#fff;font:inherit;font-size:13px;cursor:pointer}
.dshHarmonyButton:hover:not(:disabled){filter:brightness(.96)}
.dshHarmonyButton:focus-visible,.dshHarmonySecondary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dshHarmonyButton:disabled{cursor:default;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary)}
.dshHarmonySecondary{height:34px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
.dshHarmonySecondary:disabled{cursor:default;color:var(--dsw-alias-label-tertiary);opacity:.62}
.dshHarmonyStatus{margin:auto;color:var(--dsw-alias-label-tertiary);font-size:13px}
.dshHarmonyError{color:var(--dsw-alias-state-error-primary)}
.dshHarmonySkeleton{height:100%;min-height:420px;display:grid;grid-template-columns:2fr 3fr;gap:14px}
.dshHarmonySkeleton>div{border-radius:12px;background:var(--dsw-alias-bg-module-platform)}
.dshHarmonyConfirmLayer{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-mask-1)}
.dshHarmonyConfirm{width:min(380px,calc(100vw - 48px));padding:20px;border-radius:14px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3)}
.dshHarmonyConfirm h3{margin:0 0 8px;font-size:16px;line-height:24px}
.dshHarmonyConfirm p{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:21px}
.dshHarmonyConfirmActions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
.dshHarmonyRuntimeLayer{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1)}
.dshHarmonyRuntimeDialog{width:min(520px,100%);padding:22px;border-radius:14px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3)}
.dshHarmonyRuntimeDialog h2{margin:0;font-size:18px;line-height:26px;text-wrap:balance}
.dshHarmonyRuntimeDialog p{max-width:68ch;margin:8px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:21px;text-wrap:pretty}
.dshHarmonyRuntimeError{color:var(--dsw-alias-state-error-primary)!important;overflow-wrap:anywhere}
.dshHarmonyRuntimeActions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:20px}
.dshHarmonyDanger{color:var(--dsw-alias-state-error-primary)}
@media(max-width:680px){.dshHarmonyWorkspace,.dshHarmonyPatchWorkspace{grid-template-columns:1fr;overflow-y:auto}.dshHarmonyList,.dshHarmonyPatchList{min-height:220px;max-height:260px}.dshHarmonyDetail,.dshHarmonyPatchDetail{overflow:visible}.dshHarmonySkeleton{grid-template-columns:1fr}}
@media(prefers-reduced-motion:no-preference){.dshHarmonyRow{transition:background-color .16s ease,opacity .16s ease}}
`
    const styleId = 'dsh-harmony/client.css'
    if (!document.querySelector(`style[data-plugin-css="${styleId}"]`)) {
      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-harmony'
      style.dataset.pluginCss = styleId
      style.textContent = css
      document.head.appendChild(style)
    }

    const dictionaries = {
      zh: {
        nav: 'Harmony',
        orderPage: '插件排序',
        patchPage: 'Patch 状态',
        patchTitle: '运行时 Patch',
        patchIntro: '查看 Patch 的绑定、冲突和当前变换结果，或单独启用与停用 Patch。',
        patchEmpty: '当前没有 Harmony Patch。安装或启用一个声明了 Patch 的插件后，它会显示在这里。',
        patchSelect: '选择一个 Patch 查看详情。',
        patchTarget: '目标',
        patchVersion: '版本范围',
        patchFile: '目标文件',
        patchMatches: '匹配数',
        patchLoaded: '目标已加载',
        patchGeneration: '运行代次',
        patchOperation: '操作',
        patchChain: '变换链',
        patchOriginal: '原始源码',
        patchIntermediate: '中间结果',
        patchFinal: '最终源码',
        patchPending: '等待目标加载',
        patchBound: '已绑定',
        patchDisabled: '已停用',
        patchFailed: '失败',
        enable: '启用',
        disable: '停用',
        enableProvider: '启用 Provider',
        disableProvider: '停用 Provider',
        author: '作者',
        contributors: '贡献者',
        homepage: '主页',
        bugs: '问题反馈',
        license: '许可证',
        patchCount: 'Patch',
        title: '插件加载顺序',
        intro: '拖动插件来调整 Patch 的应用顺序',
        preview: '插件示意图占位',
        noDescription: '这个插件没有提供介绍。',
        before: '需要位于这些插件之前',
        after: '需要位于这些插件之后',
        noConstraints: '没有声明 Harmony 顺序约束。',
        harmony: 'Harmony',
        fixed: '固定',
        keyboard: '方向键选择 · Alt + 方向键移动 · 拖动时可继续滚动列表',
        save: '保存',
        saving: '保存中…',
        loading: '正在读取插件…',
        loadError: '无法读取插件顺序。',
        retry: '重试',
        confirmTitle: '保存插件顺序？',
        confirmBody: '退出设置前，可以保存并热加载新的顺序，也可以放弃这次调整。',
        saveExit: '保存并退出',
        discard: '不保存',
        cancel: '取消',
        runtimeTitle: '需要安装 Harmony 启动器',
        runtimeBody: '插件已经添加到当前配置，但这个 dsh 进程尚未启用 Harmony。Patch 只有在启动器安装并重新启动 dsh 后才会生效。',
        runtimeInstalled: '启动器已安装。下次启动 dsh 时将自动启用 Harmony。',
        runtimeWorking: '正在处理…',
        runtimeError: '操作失败',
        install: '安装',
        installRestart: '安装并重启',
        removePlugin: '移除插件',
        ignoreOnce: '忽略（一次）',
        done: '完成',
      },
      en: {
        nav: 'Harmony',
        orderPage: 'Plugin order',
        patchPage: 'Patch status',
        patchTitle: 'Runtime patches',
        patchIntro: 'Inspect patch bindings, conflicts and transformed source, or enable and disable individual patches.',
        patchEmpty: 'No Harmony patches are registered. Install or enable a plugin that declares patches to see it here.',
        patchSelect: 'Select a patch to inspect it.',
        patchTarget: 'Target',
        patchVersion: 'Version range',
        patchFile: 'Target file',
        patchMatches: 'Matches',
        patchLoaded: 'Target loaded',
        patchGeneration: 'Generation',
        patchOperation: 'Operation',
        patchChain: 'Transform chain',
        patchOriginal: 'Original source',
        patchIntermediate: 'Intermediate result',
        patchFinal: 'Final source',
        patchPending: 'Waiting for target',
        patchBound: 'Bound',
        patchDisabled: 'Disabled',
        patchFailed: 'Failed',
        enable: 'Enable',
        disable: 'Disable',
        enableProvider: 'Enable provider',
        disableProvider: 'Disable provider',
        author: 'Author',
        contributors: 'Contributors',
        homepage: 'Homepage',
        bugs: 'Issues',
        license: 'License',
        patchCount: 'Patches',
        title: 'Plugin load order',
        intro: 'Drag plugins to adjust the order in which patches are applied.',
        preview: 'Plugin preview placeholder',
        noDescription: 'This plugin does not provide a description.',
        before: 'Must load before',
        after: 'Must load after',
        noConstraints: 'No Harmony order constraints declared.',
        harmony: 'Harmony',
        fixed: 'Pinned',
        keyboard: 'Arrow keys select · Alt + Arrow moves · Scrolling remains available while dragging',
        save: 'Save',
        saving: 'Saving…',
        loading: 'Reading plugins…',
        loadError: 'Plugin order could not be loaded.',
        retry: 'Retry',
        confirmTitle: 'Save plugin order?',
        confirmBody: 'Save and hot-reload the new order before leaving Settings, or discard these changes.',
        saveExit: 'Save and exit',
        discard: 'Discard',
        cancel: 'Cancel',
        runtimeTitle: 'Harmony launcher required',
        runtimeBody: 'The plugin is present in this profile, but Harmony is not active in this dsh process. Patches take effect only after the launcher is installed and dsh restarts.',
        runtimeInstalled: 'The launcher is installed. Harmony will activate the next time dsh starts.',
        runtimeWorking: 'Working…',
        runtimeError: 'The operation failed',
        install: 'Install',
        installRestart: 'Install and restart',
        removePlugin: 'Remove plugin',
        ignoreOnce: 'Ignore once',
        done: 'Done',
      },
    }

    const localeNamespace = 'dsh-harmony'
    const sameOrder = (left, right) => left.length === right.length && left.every((name, index) => name === right[index])
    const harmonyPlugin = 'dsh-harmony'
    const deepseekScope = '@deepseek-ai'
    const displayName = name => name.startsWith(`${deepseekScope}/`) ? name.slice(deepseekScope.length + 1) : name
    const listName = name => displayName(name).replace(/^dsh-/, '')
    const packageScope = name => name.startsWith(`${deepseekScope}/`) ? deepseekScope : ''

    function RuntimePrompt({ t }) {
      const [status, setStatus] = useState(null)
      const [busy, setBusy] = useState(false)
      const [dismissed, setDismissed] = useState(false)
      const primary = useRef(null)

      useEffect(() => {
        fetch('/dsh-harmony/runtime', { cache: 'no-store' })
          .then(response => response.ok ? response.json() : null)
          .then(setStatus)
          .catch(() => {})
      }, [])
      useEffect(() => { if (status?.state === 'missing') primary.current?.focus() }, [status?.state])

      const choose = async action => {
        setBusy(true)
        let polling = false
        try {
          const previous = status.bootId
          const response = await fetch('/dsh-harmony/runtime', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action }),
          })
          if (!response.ok) throw new Error(`${response.status}`)
          const next = await response.json()
          setStatus(next)
          if (action === 'ignore') return setDismissed(true)
          if (action !== 'install-restart' || next.state !== 'installed') return
          polling = true
          const deadline = Date.now() + 15_000
          const poll = async () => {
            try {
              const current = await fetch('/dsh-harmony/runtime', { cache: 'no-store' }).then(result => result.json())
              if (current.bootId !== previous && current.state === 'active') return window.location.reload()
            } catch {}
            if (Date.now() < deadline) return window.setTimeout(poll, 300)
            setStatus({ state: 'error', bootId: previous, error: 'Restart timed out' })
            setBusy(false)
          }
          window.setTimeout(poll, 300)
        } catch (reason) {
          setStatus({ state: 'error', bootId: status.bootId, error: reason instanceof Error ? reason.message : String(reason) })
        } finally {
          if (!polling) setBusy(false)
        }
      }

      if (dismissed || status === null || status.state === 'active' || status.state === 'ignored' || status.state === 'removed') return null
      const installed = status.state === 'installed'
      return h('div', { className: 'dshHarmonyRuntimeLayer', role: 'presentation' },
        h('section', { className: 'dshHarmonyRuntimeDialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dsh-harmony-runtime-title' },
          h('h2', { id: 'dsh-harmony-runtime-title' }, t('runtimeTitle')),
          h('p', null, t(installed ? 'runtimeInstalled' : status.state === 'working' ? 'runtimeWorking' : 'runtimeBody')),
          status.state === 'error' ? h('p', { className: 'dshHarmonyRuntimeError', role: 'alert' }, `${t('runtimeError')}: ${status.error}`) : null,
          h('div', { className: 'dshHarmonyRuntimeActions' },
            installed
              ? h('button', { className: 'dshHarmonySecondary', type: 'button', onClick: () => setDismissed(true) }, t('done'))
              : h(React.Fragment, null,
                h('button', { className: 'dshHarmonySecondary dshHarmonyDanger', type: 'button', disabled: busy, onClick: () => { void choose('remove') } }, t('removePlugin')),
                h('button', { className: 'dshHarmonySecondary', type: 'button', disabled: busy, onClick: () => { void choose('ignore') } }, t('ignoreOnce')),
                h('button', { className: 'dshHarmonySecondary', type: 'button', disabled: busy, onClick: () => { void choose('install') } }, t('install')),
                h('button', { ref: primary, className: 'dshHarmonyButton', type: 'button', disabled: busy, onClick: () => { void choose('install-restart') } }, busy ? t('runtimeWorking') : t('installRestart'))))))
    }

    function PatchStatusPage({ t }) {
      const [patches, setPatches] = useState([])
      const [selected, setSelected] = useState(null)
      const [inspection, setInspection] = useState(null)
      const [loading, setLoading] = useState(true)
      const [busy, setBusy] = useState(null)
      const [error, setError] = useState('')
      const patch = patches.find(item => item.key === selected) ?? patches[0]
      const stateLabel = state => t({ pending: 'patchPending', bound: 'patchBound', disabled: 'patchDisabled', failed: 'patchFailed' }[state])

      const load = async () => {
        setLoading(true)
        setError('')
        try {
          const response = await fetch('/dsh-harmony/patches', { cache: 'no-store' })
          if (!response.ok) throw new Error(`${response.status}`)
          const next = await response.json()
          setPatches(next.patches)
          setSelected(current => next.patches.some(item => item.key === current) ? current : next.patches[0]?.key ?? null)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setLoading(false)
        }
      }

      useEffect(() => { void load() }, [])
      useEffect(() => {
        if (patch?.file === undefined) return setInspection(null)
        let current = true
        setInspection(null)
        const query = new URLSearchParams({ package: patch.target.package, file: patch.file })
        fetch(`/dsh-harmony/inspect?${query}`, { cache: 'no-store' })
          .then(response => response.ok ? response.json() : Promise.reject(new Error(`${response.status}`)))
          .then(value => { if (current) setInspection(value.inspections[0] ?? null) })
          .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : String(reason)) })
        return () => { current = false }
      }, [patch?.key, patch?.file])

      const toggle = async provider => {
        setBusy(patch.key)
        setError('')
        try {
          const response = await fetch('/dsh-harmony/patches', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(provider
              ? { owner: patch.owner, enabled: patches.filter(item => item.owner === patch.owner).every(item => item.state === 'disabled') }
              : { key: patch.key, enabled: patch.state === 'disabled' }),
          })
          const next = await response.json()
          if (!response.ok) throw new Error(next.error ?? `${response.status}`)
          setPatches(next.patches)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setBusy(null)
        }
      }

      return h('section', { className: 'dshHarmonyPatchPage' },
        h('header', null,
          h('h2', { className: 'dshHarmonyHeading' }, t('patchTitle')),
          h('p', { className: 'dshHarmonyIntro' }, t('patchIntro'))),
        loading ? h('div', { className: 'dshHarmonySkeleton', 'aria-label': t('loading') }, h('div'), h('div')) :
          patches.length === 0 ? h('p', { className: 'dshHarmonyStatus' }, t('patchEmpty')) :
            h('div', { className: 'dshHarmonyPatchWorkspace' },
              h('ul', { className: 'dshHarmonyPatchList', role: 'listbox', 'aria-label': t('patchTitle') },
                patches.map(item => h('li', { key: item.key },
                  h('button', {
                    className: 'dshHarmonyPatchRow', type: 'button', role: 'option',
                    'aria-selected': patch?.key === item.key,
                    onClick: () => setSelected(item.key),
                  },
                  h('span', { className: 'dshHarmonyPatchState', 'data-state': item.state, title: stateLabel(item.state) }),
                  h('span', null,
                    h('span', { className: 'dshHarmonyPatchKey', title: item.key }, item.key),
                    h('span', { className: 'dshHarmonyPatchTarget' }, `${item.target.package}/${item.file ?? item.target.files.join(' | ')} · ${stateLabel(item.state)}`)))))),
              patch === undefined ? h('p', { className: 'dshHarmonyStatus' }, t('patchSelect')) :
                h('article', { className: 'dshHarmonyPatchDetail' },
                  h('div', { className: 'dshHarmonyPatchHeader' },
                    h('div', null,
                      h('h3', { className: 'dshHarmonyTitle' }, patch.key),
                      h('p', { className: 'dshHarmonyScope' }, `${stateLabel(patch.state)} · ${patch.kind}${patch.operation ? ` / ${patch.operation}` : ''}`)),
                    h('div', { className: 'dshHarmonyPatchChain' },
                      h('button', {
                        className: 'dshHarmonySecondary', type: 'button', disabled: busy === patch.key,
                        onClick: () => { void toggle(true) },
                      }, t(patches.filter(item => item.owner === patch.owner).every(item => item.state === 'disabled') ? 'enableProvider' : 'disableProvider')),
                      h('button', {
                        className: 'dshHarmonySecondary', type: 'button', disabled: busy === patch.key || patches.filter(item => item.owner === patch.owner).every(item => item.state === 'disabled'),
                        onClick: () => { void toggle(false) },
                      }, t(patch.state === 'disabled' ? 'enable' : 'disable')))),
                  h('div', { className: 'dshHarmonyFacts' },
                    h('span', null, `${t('patchTarget')}: ${patch.target.package}`),
                    patch.target.version ? h('span', null, `${t('patchVersion')}: ${patch.target.version}`) : null,
                    h('span', null, `${t('patchFile')}: ${patch.file ?? patch.target.files.join(' | ')}`),
                    h('span', null, `${t('patchLoaded')}: ${patch.loaded ? '✓' : '—'}`),
                    h('span', null, `${t('patchMatches')}: ${patch.matches}`),
                    h('span', null, `${t('patchGeneration')}: ${patch.generation}`),
                    patch.operation ? h('span', null, `${t('patchOperation')}: ${patch.operation}`) : null),
                  patch.error ? h('p', { className: 'dshHarmonyConstraint dshHarmonyError', role: 'alert' }, patch.error) : null,
                  inspection ? h(React.Fragment, null,
                    h('h4', { className: 'dshHarmonyScope' }, t('patchChain')),
                    h('div', { className: 'dshHarmonyPatchChain' }, inspection.steps.map(step => h('span', { key: step.key }, `${step.key} · ${step.matches}`))),
                    h('h4', { className: 'dshHarmonyScope' }, t('patchOriginal')),
                    h('pre', { className: 'dshHarmonyPatchCode' }, inspection.original),
                    inspection.steps.map(step => h(React.Fragment, { key: step.key },
                      h('h4', { className: 'dshHarmonyScope' }, `${t('patchIntermediate')}: ${step.key}`),
                      h('pre', { className: 'dshHarmonyPatchCode' }, step.source))),
                    h('h4', { className: 'dshHarmonyScope' }, t('patchFinal')),
                    h('pre', { className: 'dshHarmonyPatchCode' }, inspection.final)) : null)),
        error ? h('p', { className: 'dshHarmonyHint dshHarmonyError', role: 'alert' }, `${t('runtimeError')}: ${error}`) : null)
    }

    function HarmonySettings({ t }) {
      const [page, setPage] = useState('order')
      const [view, setView] = useState(null)
      const [savedOrder, setSavedOrder] = useState([])
      const [draftOrder, setDraftOrder] = useState([])
      const [selected, setSelected] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [saving, setSaving] = useState(false)
      const [closePrompt, setClosePrompt] = useState(null)
      const [dragging, setDragging] = useState(null)
      const listRef = useRef(null)
      const rowRefs = useRef(new Map())
      const drag = useRef(null)
      const pendingClose = useRef(null)
      const promptButton = useRef(null)
      const draftRef = useRef(draftOrder)
      const dirtyRef = useRef(false)
      const saveRef = useRef(null)

      const dirty = !sameOrder(savedOrder, draftOrder)
      draftRef.current = draftOrder
      dirtyRef.current = dirty
      const plugins = useMemo(() => new Map((view?.plugins ?? []).map(plugin => [plugin.name, plugin])), [view])
      const selectedPlugin = plugins.get(selected) ?? plugins.get(draftOrder[0])

      const load = async () => {
        setLoading(true)
        setError('')
        try {
          const response = await fetch('/dsh-harmony/order')
          if (!response.ok) throw new Error(`${response.status}`)
          const next = await response.json()
          setView(next)
          setSavedOrder(next.order)
          setDraftOrder(next.order)
          setSelected(current => next.order.includes(current) ? current : next.order[0] ?? null)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setLoading(false)
        }
      }

      const save = async () => {
        setSaving(true)
        setError('')
        try {
          const response = await fetch('/dsh-harmony/order', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ order: draftRef.current }),
          })
          const next = await response.json()
          if (!response.ok) throw new Error(next.error ?? `${response.status}`)
          setView(next)
          setSavedOrder(next.order)
          setDraftOrder(next.order)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          throw reason
        } finally {
          setSaving(false)
        }
      }
      saveRef.current = save

      useEffect(() => { void load() }, [])
      useEffect(() => { if (closePrompt !== null) promptButton.current?.focus() }, [closePrompt])
      useEffect(() => {
        const guard = () => {
          if (!dirtyRef.current) return Promise.resolve(true)
          if (pendingClose.current !== null) return pendingClose.current.promise
          let resolve
          const promise = new Promise(next => { resolve = next })
          pendingClose.current = { promise, resolve }
          setClosePrompt(true)
          return promise
        }
        globalThis.__dshHarmonyBeforeSettingsClose = guard
        const beforeUnload = event => {
          if (!dirtyRef.current) return
          event.preventDefault()
          event.returnValue = ''
        }
        window.addEventListener('beforeunload', beforeUnload)
        return () => {
          if (globalThis.__dshHarmonyBeforeSettingsClose === guard) delete globalThis.__dshHarmonyBeforeSettingsClose
          window.removeEventListener('beforeunload', beforeUnload)
        }
      }, [])

      const focus = name => requestAnimationFrame(() => rowRefs.current.get(name)?.focus())
      const moveTo = (name, target) => {
        if (saving) return
        setDraftOrder(current => {
          const from = current.indexOf(name)
          const firstMovable = current[0] === harmonyPlugin ? 1 : 0
          target = Math.max(firstMovable, target)
          if (name === harmonyPlugin || from === -1 || target >= current.length || from === target) return current
          const next = [...current]
          next.splice(from, 1)
          next.splice(target, 0, name)
          return next
        })
      }
      const moveBy = (name, offset) => {
        const index = draftRef.current.indexOf(name)
        moveTo(name, index + offset)
        focus(name)
      }
      const moveFromPointer = event => {
        if (saving) return
        const active = drag.current
        if (active?.pointerId !== event.pointerId) return
        const rows = [...event.currentTarget.querySelectorAll('[data-plugin-name]')]
          .filter(row => row.dataset.pluginName !== active.name)
        const target = rows.findIndex(row => {
          const bounds = row.getBoundingClientRect()
          return event.clientY < bounds.top + bounds.height / 2
        })
        moveTo(active.name, target === -1 ? rows.length : target)
      }
      const finishDrag = event => {
        const active = drag.current
        if (active?.pointerId !== event.pointerId) return
        drag.current = null
        setDragging(null)
        setSelected(active.name)
      }
      const selectBy = (name, offset) => {
        const index = draftRef.current.indexOf(name)
        const next = draftRef.current[Math.max(0, Math.min(draftRef.current.length - 1, index + offset))]
        if (next !== undefined) {
          setSelected(next)
          focus(next)
        }
      }
      const finishPrompt = allow => {
        const prompt = pendingClose.current
        pendingClose.current = null
        setClosePrompt(null)
        prompt.resolve(allow)
      }

      if (loading) return h('div', { className: 'dshHarmonyPage' },
        h('h2', { className: 'dshHarmonyHeading' }, t('title')),
        h('p', { className: 'dshHarmonyIntro' }, t('loading')),
        h('div', { className: 'dshHarmonySkeleton', 'aria-hidden': 'true' }, h('div'), h('div')))
      if (view === null) return h('div', { className: 'dshHarmonyPage' },
        h('h2', { className: 'dshHarmonyHeading' }, t('title')),
        h('p', { className: 'dshHarmonyStatus dshHarmonyError', role: 'alert' }, `${t('loadError')} ${error}`),
        h('button', { className: 'dshHarmonySecondary', type: 'button', onClick: () => { void load() } }, t('retry')))

      const constraints = selectedPlugin === undefined ? [] : [
        selectedPlugin.before.length > 0 ? `${t('before')}: ${selectedPlugin.before.join(', ')}` : '',
        selectedPlugin.after.length > 0 ? `${t('after')}: ${selectedPlugin.after.join(', ')}` : '',
      ].filter(Boolean)

      return h('div', { className: 'dshHarmonyPage' },
        h('nav', { className: 'dshHarmonyTabs', role: 'tablist', 'aria-label': t('nav') },
          h('button', {
            className: 'dshHarmonyTab', type: 'button', role: 'tab', 'aria-selected': page === 'order',
            onClick: () => setPage('order'),
          }, t('orderPage')),
          h('button', {
            className: 'dshHarmonyTab', type: 'button', role: 'tab', 'aria-selected': page === 'patches',
            onClick: () => setPage('patches'),
          }, t('patchPage'))),
        page === 'patches' ? h(PatchStatusPage, { t }) : h(React.Fragment, null,
        h('header', null,
          h('h2', { className: 'dshHarmonyHeading' }, t('title')),
          h('p', { className: 'dshHarmonyIntro' }, t('intro'))),
        h('div', { className: 'dshHarmonyWorkspace' },
          h('ul', {
            ref: listRef,
            className: 'dshHarmonyList',
            role: 'listbox',
            'aria-label': t('title'),
            onPointerMove: moveFromPointer,
            onPointerUp: finishDrag,
            onPointerCancel: finishDrag,
          },
            draftOrder.map((name, index) => {
              const plugin = plugins.get(name)
              const isDragging = dragging === name
              const isFixed = name === harmonyPlugin
              return h('li', { key: name },
                h('button', {
                  ref: element => element === null ? rowRefs.current.delete(name) : rowRefs.current.set(name, element),
                  type: 'button',
                  role: 'option',
                  className: 'dshHarmonyRow',
                  'data-plugin-name': name,
                  'data-selected': selectedPlugin?.name === name ? 'true' : undefined,
                  'data-dragging': isDragging ? 'true' : undefined,
                  'data-fixed': isFixed ? 'true' : undefined,
                  'aria-selected': selectedPlugin?.name === name,
                  'aria-grabbed': isDragging,
                  'aria-disabled': saving || isFixed,
                  onClick: () => { setSelected(name) },
                  onPointerDown: event => {
                    if (event.button !== 0 || isFixed || saving) return
                    listRef.current.setPointerCapture(event.pointerId)
                    drag.current = { name, pointerId: event.pointerId }
                    setDragging(name)
                    setSelected(name)
                  },
                  onKeyDown: event => {
                    if (saving) return
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                    event.preventDefault()
                    const offset = event.key === 'ArrowUp' ? -1 : 1
                    if (event.altKey) moveBy(name, offset)
                    else selectBy(name, offset)
                  },
                },
                h('span', { className: 'dshHarmonyGrip', 'aria-hidden': 'true' }, isFixed ? '•' : '⠿'),
                h('span', { className: 'dshHarmonyIndex' }, String(index + 1).padStart(2, '0')),
                h('span', { className: 'dshHarmonyName', title: name }, listName(name)),
                isFixed
                  ? h('span', { className: 'dshHarmonyBadge' }, t('fixed'))
                  : plugin?.harmony ? h('span', { className: 'dshHarmonyBadge' }, t('harmony')) : null))
            })),
          selectedPlugin === undefined ? h('p', { className: 'dshHarmonyStatus' }, t('noDescription')) :
            h('section', { className: 'dshHarmonyDetail', 'aria-live': 'polite' },
              h('div', { className: 'dshHarmonyPreview' },
                selectedPlugin.name === harmonyPlugin
                  ? h(React.Fragment, null,
                    h('img', { className: 'dshHarmonyPreviewImage dshHarmonyPreviewImageLight', src: '/dsh-harmony/assets/harmony-preview-light.png', alt: '' }),
                    h('img', { className: 'dshHarmonyPreviewImage dshHarmonyPreviewImageDark', src: '/dsh-harmony/assets/harmony-preview.png', alt: '' }))
                  : h(React.Fragment, null,
                    h('div', { className: 'dshHarmonyPreviewMark', 'aria-hidden': 'true' }, selectedPlugin.name.replace(/^@[^/]+\//, '').charAt(0).toUpperCase()),
                    h('span', { className: 'dshHarmonyPreviewLabel' }, t('preview')))),
              h('div', { className: 'dshHarmonyIdentity' },
                h('div', { className: 'dshHarmonyMeta' },
                  h('h3', { className: 'dshHarmonyTitle' }, displayName(selectedPlugin.name)),
                  selectedPlugin.version ? h('span', { className: 'dshHarmonyVersion' }, `v${selectedPlugin.version}`) : null),
                packageScope(selectedPlugin.name)
                  ? h('p', { className: 'dshHarmonyScope' }, packageScope(selectedPlugin.name))
                  : null),
              h('p', { className: 'dshHarmonyDescription' }, selectedPlugin.description || t('noDescription')),
              h('div', { className: 'dshHarmonyFacts' },
                selectedPlugin.author ? h('span', null, `${t('author')}: ${selectedPlugin.author}`) : null,
                selectedPlugin.contributors.length > 0 ? h('span', null, `${t('contributors')}: ${selectedPlugin.contributors.join(', ')}`) : null,
                selectedPlugin.license ? h('span', null, `${t('license')}: ${selectedPlugin.license}`) : null,
                selectedPlugin.harmony ? h('span', null, `${t('patchCount')}: ${selectedPlugin.patchCount}`) : null,
                selectedPlugin.homepage ? h('a', { href: selectedPlugin.homepage, target: '_blank', rel: 'noreferrer' }, t('homepage')) : null,
                selectedPlugin.bugs ? h('a', { href: selectedPlugin.bugs, target: '_blank', rel: 'noreferrer' }, t('bugs')) : null),
              selectedPlugin.harmony
                ? h('p', { className: 'dshHarmonyConstraint' }, constraints.length > 0 ? constraints.join(' · ') : t('noConstraints'))
                : null)),
        h('footer', { className: 'dshHarmonyFooter' },
          h('p', { className: 'dshHarmonyHint' }, t('keyboard')),
          h('button', { className: 'dshHarmonyButton', type: 'button', disabled: !dirty || saving, onClick: () => { void save().catch(() => {}) } }, saving ? t('saving') : t('save'))),
        error ? h('p', { className: 'dshHarmonyHint dshHarmonyError', role: 'alert' }, `${t('loadError')} ${error}`) : null,
        closePrompt ? h('div', { className: 'dshHarmonyConfirmLayer', role: 'presentation' },
          h('div', { className: 'dshHarmonyConfirm', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dsh-harmony-confirm-title' },
            h('h3', { id: 'dsh-harmony-confirm-title' }, t('confirmTitle')),
            h('p', null, t('confirmBody')),
            h('div', { className: 'dshHarmonyConfirmActions' },
              h('button', { className: 'dshHarmonySecondary', type: 'button', onClick: () => finishPrompt(false) }, t('cancel')),
              h('button', { className: 'dshHarmonySecondary', type: 'button', onClick: () => finishPrompt(true) }, t('discard')),
              h('button', {
                ref: promptButton,
                className: 'dshHarmonyButton', type: 'button', disabled: saving,
                onClick: () => { void saveRef.current().then(() => finishPrompt(true)).catch(() => {}) },
              }, saving ? t('saving') : t('saveExit'))))) : null))
    }

    const inject = ['slots', 'locale']
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(localeNamespace, dictionaries), 'dsh-harmony: dictionaries')
      const t = ctx.locale.bind(localeNamespace)
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'harmony-runtime',
        order: -110,
        locale: localeNamespace,
      }, RuntimePrompt))
      ctx.effect(async () => {
        const status = await fetch('/dsh-harmony/runtime', { cache: 'no-store' }).then(response => response.json())
        if (status.state !== 'active') return
        return ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'harmony',
          order: 35,
          label: () => t('nav'),
          locale: localeNamespace,
        }, HarmonySettings))
      }, 'dsh-harmony: settings section')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
