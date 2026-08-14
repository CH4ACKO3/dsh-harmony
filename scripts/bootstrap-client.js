window.__ModuleLoader__.load({
  id: 'dsh-harmony-bootstrap',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { createElement: h, useEffect, useState } = React
    const namespace = 'dsh-harmony-bootstrap'
    const dictionaries = {
      zh: {
        message: 'Harmony 启动器已恢复，需要重启才能启用 Patch。',
        restart: '立刻重启',
        restarting: '正在重启…',
        failed: '重启失败，请重试。',
        retry: '重试',
      },
      en: {
        message: 'The Harmony launcher was restored. Restart to enable patches.',
        restart: 'Restart now',
        restarting: 'Restarting…',
        failed: 'Restart failed. Try again.',
        retry: 'Retry',
      },
    }

    const css = `
.dshHarmonyRestart{pointer-events:auto;display:flex;align-items:center;gap:14px;max-width:min(560px,calc(100vw - 32px));margin:16px auto;padding:10px 12px 10px 16px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv2);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dshHarmonyRestart span{flex:1}
.dshHarmonyRestart button{flex:none;height:30px;padding:0 12px;border:0;border-radius:8px;background:var(--dsw-alias-state-business-primary);color:#fff;font:inherit;font-size:13px;cursor:pointer}
.dshHarmonyRestart button:hover:not(:disabled){filter:brightness(.96)}
.dshHarmonyRestart button:active:not(:disabled){filter:brightness(.92)}
.dshHarmonyRestart button:disabled{cursor:default;opacity:.6}
.dshHarmonyRestart button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
@media(max-width:480px){.dshHarmonyRestart{align-items:stretch;flex-direction:column}.dshHarmonyRestart button{align-self:flex-end}}
`
    if (!document.querySelector('style[data-plugin-css="dsh-harmony-bootstrap"]')) {
      const style = document.createElement('style')
      style.dataset.pluginCss = 'dsh-harmony-bootstrap'
      style.textContent = css
      document.head.appendChild(style)
    }

    function RestartBanner({ t }) {
      const [status, setStatus] = useState(null)
      const [restarting, setRestarting] = useState(false)
      const [failed, setFailed] = useState(false)

      useEffect(() => {
        fetch('/dsh-harmony-bootstrap/restart', { cache: 'no-store' })
          .then(response => response.json())
          .then(setStatus)
          .catch(() => {})
      }, [])

      const restart = async () => {
        setRestarting(true)
        setFailed(false)
        try {
          const response = await fetch('/dsh-harmony-bootstrap/restart', { method: 'POST' })
          if (!response.ok) throw new Error(`restart returned ${response.status}`)
          const previous = status.bootId
          const deadline = Date.now() + 15_000
          const poll = async () => {
            try {
              const nextResponse = await fetch('/dsh-harmony-bootstrap/restart', { cache: 'no-store' })
              const next = await nextResponse.json()
              if (next.bootId !== previous) return window.location.reload()
            } catch {}
            if (Date.now() < deadline) return window.setTimeout(poll, 300)
            setRestarting(false)
            setFailed(true)
          }
          window.setTimeout(poll, 300)
        } catch {
          setRestarting(false)
          setFailed(true)
        }
      }

      if (!status?.restart) return null
      return h('div', { className: 'dshHarmonyRestart', role: 'status' },
        h('span', null, t(failed ? 'failed' : 'message')),
        h('button', { type: 'button', disabled: restarting, onClick: () => { void restart() } },
          restarting ? t('restarting') : t(failed ? 'retry' : 'restart')))
    }

    const inject = ['slots', 'locale']
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(namespace, dictionaries), 'dsh-harmony-bootstrap: dictionaries')
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'dsh-harmony-restart',
        order: -100,
        locale: namespace,
      }, RestartBanner))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
