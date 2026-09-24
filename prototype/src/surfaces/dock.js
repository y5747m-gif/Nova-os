/* ══════════════════════════════════════════════════════════════
   NOVA DOCK — the computer's bar of open apps (desktop shell)
   Same data as CANVAS: the running windows, the favourites, and
   one door to كل التطبيقات. Rendered inside #screen; visible only
   when body[data-shell="desktop"].
   ══════════════════════════════════════════════════════════════ */

import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { APPS, appMeta, state, subscribe } from '../core/store.js';

const FAVORITES = ['whatsapp', 'gallery', 'terminal', 'calc', 'settings'];

export function mountDock(layer, ctx = {}) {
  const el = h('div', { class: 'dock', dataset: { nodrag: '1', shell: 'dock' } });
  layer.append(el);

  function appBtn(appId, extraClass = '') {
    const meta = appMeta(appId);
    const focused = state.surface === 'app' && state.focusedApp === appId;
    return h('button', {
      class: `dock__btn ${extraClass}${focused ? ' dock__btn--focus' : ''}`.trim(),
      dataset: { app: appId },
      title: meta.name,
      onclick: (e) => { e.stopPropagation(); ctx.onOpenApp?.(appId, e.currentTarget); },
    },
      h('span', { class: 'dock__ico', style: { color: meta.color }, html: icon(meta.icon, 'ico ico--sm') }),
      h('span', { class: 'dock__label' }, meta.name),
    );
  }

  function render() {
    const openIds = state.windows.map((w) => w.appId);
    if (state.focusedApp && !openIds.includes(state.focusedApp)) openIds.unshift(state.focusedApp);

    const kids = [
      h('span', { class: 'dock__brand', 'aria-hidden': 'true' }, h('img', { src: 'icons/icon-192.png', alt: '' })),
      ...FAVORITES.filter((id) => APPS[id]).map((id) => appBtn(id, 'dock__btn--fav')),
      h('i', { class: 'dock__sep' }),
      ...openIds.slice(0, 6).map((id) => appBtn(id, 'dock__btn--open')),
      h('i', { class: 'dock__sep' }),
      h('button', {
        class: 'dock__btn dock__btn--all',
        dataset: { nodrag: '1' },
        title: 'كل التطبيقات',
        onclick: (e) => { e.stopPropagation(); ctx.onAllApps?.(); },
      }, h('span', { class: 'dock__ico', html: icon('apps', 'ico ico--sm') }),
      h('span', { class: 'dock__label' }, 'الكل')),
    ];
    el.replaceChildren(...kids);
  }

  subscribe((s, what) => {
    if (what === 'windows' || what === 'focus' || what === '*') render();
  });
  render();

  return { el, render };
}
